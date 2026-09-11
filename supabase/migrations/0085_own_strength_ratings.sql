-- En Garde's own strength number (Ricky's spec, 2026-09-11): fitted from
-- every recorded bout, pools and eliminations; who won AND how close, on
-- separate scales; each fencer a curve over time so recent bouts weigh
-- most and old ones fade. Written nightly by supabase-backups\strength-model.py
-- (service key); members read. The scale is ours: 400 points = 10-to-1
-- odds in a 15-touch bout. Applied 2026-09-11.

create table if not exists own_ratings (
  tracker_id bigint primary key,      -- the USA Fencing member number
  name text,
  birth_year integer,
  country text,
  rating integer not null,            -- today's estimate
  sd integer not null,                -- its uncertainty today
  bouts integer not null,
  wins integer not null,
  events integer not null,
  first_bout date,
  last_bout date,
  bouts_90 integer,
  bouts_365 integer,
  delta_90 integer,                   -- change over the last 90 days, null if unknown
  delta_180 integer,
  delta_365 integer,
  category text,                      -- of the last event fenced
  gender text,
  updated_at timestamptz not null default now()
);
create index if not exists own_ratings_rating on own_ratings (rating desc);

create table if not exists own_rating_history (
  tracker_id bigint not null,
  day date not null,
  rating integer not null,
  sd integer not null,
  bouts integer not null,
  wins integer not null,
  primary key (tracker_id, day)
);

create table if not exists own_rating_fit (
  id integer primary key default 1,
  bouts integer,
  fencers integer,
  days integer,
  passes integer,
  max_step numeric,
  scale_win_de numeric,
  scale_win_pool numeric,
  scale_share_de numeric,
  scale_share_pool numeric,
  share_weight numeric,
  drift_sd_year numeric,
  prior_sd numeric,
  anchors jsonb,
  check_corr numeric,                 -- agreement with an outside reference, aggregate only
  check_n integer,
  first_bout date,
  last_bout date,
  seconds integer,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['own_ratings', 'own_rating_history', 'own_rating_fit'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select on %I to authenticated', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists member_gate on %I', t);
    execute format('create policy member_gate on %I as restrictive for all to authenticated using (is_member()) with check (is_member())', t);
  end loop;
end $$;

-- How active a fencer has been, next to the number (Ricky, 2026-09-11: two
-- events a year ago are not four events last month).
alter table own_ratings add column if not exists bouts_180 integer;
alter table own_ratings add column if not exists bouts_270 integer;
alter table own_ratings add column if not exists events_90 integer;
alter table own_ratings add column if not exists events_180 integer;
alter table own_ratings add column if not exists events_270 integer;
alter table own_ratings add column if not exists events_365 integer;
alter table own_rating_fit add column if not exists local_weight numeric;
