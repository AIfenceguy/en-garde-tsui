-- The official entry list of an event, from USA Fencing's tournament page
-- (GET /details/tournaments/{id}/entrants?event_id=N answers JSON carrying
-- the same table the "View Entrants" button shows: name, rating, member
-- number, status, club / division, and a "Total Entrants N" header). Public,
-- no account. Read by refresh-usaf inside the daily tournament pass for the
-- foil Y10 to Junior events, only when the page's count changed or our copy
-- is three days old, and written only when the rows parsed equal the page's
-- own total. Keyed by member number, the same key as the results copy and
-- own_ratings. Ricky, 2026-09-11: "this is how you see the registrants".

create table if not exists usaf_entrants (
  event_id integer not null,
  member_id text not null,
  name text,
  rating text,
  country text,
  club text,
  division text,
  status text,
  read_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
create index if not exists usaf_entrants_member on usaf_entrants (member_id);
alter table usaf_events add column if not exists entrants_listed integer;    -- the page's own total when the list was read
alter table usaf_events add column if not exists entrants_read_at timestamptz;

alter table usaf_entrants enable row level security;
revoke all on usaf_entrants from anon;
grant select on usaf_entrants to authenticated;
drop policy if exists usaf_entrants_read on usaf_entrants;
create policy usaf_entrants_read on usaf_entrants for select to authenticated using (true);
drop policy if exists member_gate on usaf_entrants;
create policy member_gate on usaf_entrants as restrictive for all to authenticated using (is_member()) with check (is_member());
