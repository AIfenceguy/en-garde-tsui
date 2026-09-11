-- FencingTracker numbers its results pages separately from its event
-- previews: /event/{id} (entry list) and /event/{rid}/results (finishers and
-- bouts) are two id spaces. ft_results and ft_bouts are keyed by the results
-- id; this table describes each results page read, target or not, so the
-- scan can resume. Applied 2026-09-11.

create table if not exists ft_result_events (
  rid integer primary key,
  ok boolean not null default true,     -- false: the page does not exist
  title text,
  event_name text,
  tournament text,
  category text,
  gender text,
  weapon text,
  event_date date,
  venue text,
  city text,
  finishers integer,
  target boolean not null default false,
  results_read_at timestamptz,
  read_at timestamptz not null default now()
);
create index if not exists ft_result_events_kind on ft_result_events (weapon, gender, category, event_date);

alter table ft_events add column if not exists results_rid integer;

alter table ft_result_events enable row level security;
revoke all on ft_result_events from anon;
grant select on ft_result_events to authenticated;
drop policy if exists ft_result_events_read on ft_result_events;
create policy ft_result_events_read on ft_result_events for select to authenticated using (true);
drop policy if exists member_gate on ft_result_events;
create policy member_gate on ft_result_events as restrictive for all to authenticated using (is_member()) with check (is_member());
