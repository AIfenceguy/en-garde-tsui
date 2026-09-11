-- The flight watch learns what a family actually wants: a departure window by
-- date and hour, how many stops are acceptable, and whether the return leg
-- is watched at all. The checker keeps every itinerary it saw, not only the
-- cheapest, so the Travel screen can show the real options. Applied 2026-09-10.

alter table flight_watches
  add column if not exists max_stops integer,            -- null any, 0 nonstop, 1 up to one stop
  add column if not exists watch_return boolean not null default true,
  add column if not exists depart_before time,            -- outbound must take off before this local hour
  add column if not exists return_after time,             -- return must take off after this local hour
  add column if not exists return_before time;
-- The old nonstop switch maps onto the new stops setting.
update flight_watches set max_stops = 0 where nonstop_only is true and max_stops is null;

-- Which leg a recorded fare belongs to: out (default, all history so far),
-- ret, or rt for a priced round trip.
alter table flight_prices add column if not exists leg text not null default 'out';
create index if not exists flight_prices_watch_leg on flight_prices (watch_id, leg, observed_at desc);

create table if not exists flight_offers (
  id uuid primary key default gen_random_uuid(),
  watch_id uuid not null references flight_watches (id) on delete cascade,
  leg text not null default 'out',
  origin text,
  destination text,
  depart_date date,
  rank integer,
  price numeric,
  price_per_person numeric,
  airline text,
  flight_numbers text,
  depart_at text,
  arrive_at text,
  stops integer,
  duration_minutes integer,
  layovers jsonb,
  max_layover_minutes integer,
  fits boolean not null default true,
  booking_url text,
  observed_at timestamptz not null default now()
);
create index if not exists flight_offers_watch on flight_offers (watch_id, leg, observed_at desc);

alter table flight_offers enable row level security;
revoke all on flight_offers from anon;
grant select on flight_offers to authenticated;
drop policy if exists flight_offers_select on flight_offers;
create policy flight_offers_select on flight_offers for select to authenticated
  using (exists (select 1 from flight_watches w where w.id = flight_offers.watch_id and w.owner_user_id = auth.uid()));
drop policy if exists flight_offers_kid_gate on flight_offers;
create policy flight_offers_kid_gate on flight_offers for select to authenticated using (kid_can('travel'));
drop policy if exists member_gate on flight_offers;
create policy member_gate on flight_offers as restrictive for all to authenticated using (is_member()) with check (is_member());
