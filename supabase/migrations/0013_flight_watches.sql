-- Flight price watching for out-of-state competitions.
--
-- Kelly currently checks fares by hand every day. A watch records the route
-- and dates once; a daily job records what the fare was, so instead of
-- "is today cheap?" she can see "is today cheap compared to the last 30 days?"
-- and get told when it drops.
--
-- flight_prices is append-only history: never update a row, always insert, so
-- the price curve stays intact.

create table if not exists flight_watches (
    id              uuid primary key default gen_random_uuid(),
    -- watches belong to the family account, not a fencer profile
    owner_user_id   uuid not null references auth.users(id) on delete cascade,
    label           text,
    -- IATA codes, uppercased on write
    origin          text not null,
    destination     text not null,
    depart_date     date not null,
    return_date     date,
    passengers      int not null default 1 check (passengers between 1 and 9),
    cabin           text default 'ECONOMY',
    nonstop_only    boolean not null default false,
    -- alert when the fare drops to or below this, in whole dollars
    target_price    int,
    -- who to text, and how; carrier_gateway supports free email-to-SMS
    alert_phone     text,
    carrier_gateway text,
    alert_email     text,
    is_active       boolean not null default true,
    -- set once an alert fires so we do not text the same drop every day
    last_alerted_at timestamptz,
    last_checked_at timestamptz,
    notes           text,
    created_at      timestamptz not null default now(),
    deleted_at      timestamptz
);

create index if not exists flight_watches_active_idx
    on flight_watches (owner_user_id, depart_date) where deleted_at is null and is_active;

alter table flight_watches enable row level security;

drop policy if exists flight_watches_select on flight_watches;
create policy flight_watches_select on flight_watches
    for select using (owner_user_id = auth.uid());

drop policy if exists flight_watches_insert on flight_watches;
create policy flight_watches_insert on flight_watches
    for insert with check (owner_user_id = auth.uid());

drop policy if exists flight_watches_update on flight_watches;
create policy flight_watches_update on flight_watches
    for update using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());

-- ============================================================
-- flight_prices - append-only observations
-- ============================================================
create table if not exists flight_prices (
    id             uuid primary key default gen_random_uuid(),
    watch_id       uuid not null references flight_watches(id) on delete cascade,
    price          numeric(10,2) not null,
    currency       text not null default 'USD',
    airline        text,
    flight_numbers text,
    depart_at      timestamptz,
    arrive_at      timestamptz,
    stops          int,
    duration_min   int,
    -- deep link so an alert can go straight to booking
    booking_url    text,
    source         text not null default 'amadeus',
    -- full provider payload, kept so we can re-read it if the shape changes
    raw            jsonb,
    observed_at    timestamptz not null default now()
);

create index if not exists flight_prices_watch_idx
    on flight_prices (watch_id, observed_at desc);
create index if not exists flight_prices_cheapest_idx
    on flight_prices (watch_id, price);

alter table flight_prices enable row level security;

-- Prices are visible when you can see the watch they belong to.
drop policy if exists flight_prices_select on flight_prices;
create policy flight_prices_select on flight_prices
    for select using (
        exists (
            select 1 from flight_watches w
            where w.id = watch_id and w.owner_user_id = auth.uid()
        )
    );

drop policy if exists flight_prices_insert on flight_prices;
create policy flight_prices_insert on flight_prices
    for insert with check (
        exists (
            select 1 from flight_watches w
            where w.id = watch_id and w.owner_user_id = auth.uid()
        )
    );

-- History must not be rewritten or erased.
revoke update, delete on flight_prices from anon, authenticated;
revoke delete on flight_watches from anon, authenticated;

grant all on flight_watches to service_role;
grant all on flight_prices  to service_role;

comment on table flight_prices is
'Append-only fare observations. Never updated - the point is the curve over time, which is what tells you whether today is actually cheap.';
