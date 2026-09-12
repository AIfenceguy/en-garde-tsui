-- Our copy of what askFRED's API gives us (token in the ASKFRED_TOKEN secret,
-- read by the askfred edge function on a schedule, never while rendering).
-- askfred_cache keeps each URL's ETag and last body so an unchanged page costs
-- a 304; askfred_records keeps the household's own fencers, registrations and
-- bouts as the API sends them (attributes/relationships), shape-agnostic while
-- the API is in beta. Applied 2026-09-12. The same day: cron job
-- en-garde-refresh-local (12:15 UTC) repointed to askfred {"action":"calendar"};
-- refresh-local redeployed as a 410 stub.
create table if not exists public.askfred_cache (
  url text primary key,
  etag text,
  body jsonb,
  status integer,
  fetched_at timestamptz not null default now()
);
create table if not exists public.askfred_records (
  kind text not null,
  id uuid not null,
  owner_user_id uuid,
  attributes jsonb not null default '{}'::jsonb,
  relationships jsonb,
  fetched_at timestamptz not null default now(),
  primary key (kind, id)
);
create table if not exists public.askfred_runs (
  id bigserial primary key,
  action text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  requests integer default 0,
  notes jsonb
);
alter table public.askfred_cache enable row level security;
alter table public.askfred_records enable row level security;
alter table public.askfred_runs enable row level security;
revoke all on public.askfred_cache, public.askfred_records, public.askfred_runs from anon;
grant select on public.askfred_records to authenticated;
drop policy if exists askfred_records_member on public.askfred_records;
create policy askfred_records_member on public.askfred_records for select to authenticated using (public.is_member());
