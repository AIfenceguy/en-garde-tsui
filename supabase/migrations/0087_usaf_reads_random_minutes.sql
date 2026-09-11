-- Ricky, 2026-09-11: the USA Fencing reads should not fire at the same minute
-- every day. Same reads as 0086 (ten standings lists, the calendar, four
-- entrant passes), same quiet window (10:00-11:30 UTC, 3:00-4:30 am Pacific in
-- summer), but a planner draws each day's minute and second and order, and a
-- runner fires them one at a time, to the second. The identified user agent
-- and the pace are unchanged. Applied 2026-09-11 with Ricky's explicit go.

create table if not exists usaf_read_plan (
  id bigserial primary key,
  planned_for date not null,          -- the UTC day of the window
  kind text not null,                 -- standings:CADET:MENS | calendar | entrants
  run_at timestamptz not null,
  fired_at timestamptz,
  request_id bigint,
  created_at timestamptz not null default now()
);
create index if not exists usaf_read_plan_due on usaf_read_plan (run_at) where fired_at is null;
alter table usaf_read_plan enable row level security;
revoke all on usaf_read_plan from anon, authenticated;

-- The request body of each kind of read, built when it fires.
create or replace function usaf_read_body(p_kind text)
returns jsonb language sql stable as $$
  select case
    when p_kind = 'calendar' then '{"calendar":true}'::jsonb
    when p_kind = 'entrants' then '{"upcoming":true,"days":120}'::jsonb
    when p_kind like 'standings:%' then
      jsonb_build_object('age_category', split_part(p_kind, ':', 2), 'gender', split_part(p_kind, ':', 3), 'weapon', 'FOIL')
      || case when split_part(p_kind, ':', 2) in ('CADET', 'JUNIOR') then '{"pages":2}'::jsonb else '{}'::jsonb end
    else null end
$$;

create or replace function plan_usaf_reads(p_day date default (now() at time zone 'utc')::date)
returns integer language plpgsql security definer set search_path = public as $$
declare
  kinds text[] := array['standings:Y10:MENS', 'standings:Y10:WOMENS', 'standings:Y12:MENS', 'standings:Y12:WOMENS',
                        'standings:Y14:MENS', 'standings:Y14:WOMENS', 'standings:CADET:MENS', 'standings:CADET:WOMENS',
                        'standings:JUNIOR:MENS', 'standings:JUNIOR:WOMENS', 'calendar', 'entrants', 'entrants', 'entrants', 'entrants'];
  k text; t timestamptz; n integer := 0;
begin
  if exists (select 1 from usaf_read_plan where planned_for = p_day) then return 0; end if;
  -- Shuffle, then walk the window: a random start inside its first twenty
  -- minutes, then 90 seconds to six and a half minutes between reads.
  select array_agg(x order by random()) into kinds from unnest(kinds) x;
  t := (p_day::text || ' 10:00:00+00')::timestamptz + (random() * 1200) * interval '1 second';
  foreach k in array kinds loop
    insert into usaf_read_plan (planned_for, kind, run_at) values (p_day, k, t);
    n := n + 1;
    t := t + (90 + random() * 300) * interval '1 second';
  end loop;
  return n;
end $$;
revoke all on function plan_usaf_reads(date) from public;

-- Every minute: the next read due within the minute, at its exact second.
create or replace function run_usaf_reads()
returns integer language plpgsql security definer set search_path = public as $$
declare r usaf_read_plan; wait double precision; rid bigint;
begin
  select * into r from usaf_read_plan
   where fired_at is null and run_at <= now() + interval '58 seconds'
   order by run_at limit 1 for update skip locked;
  if not found then return 0; end if;
  wait := extract(epoch from r.run_at - now());
  if wait > 0 then perform pg_sleep(least(wait, 58)); end if;
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := usaf_read_body(r.kind),
    timeout_milliseconds := case when r.kind = 'entrants' then 150000 else 120000 end) into rid;
  update usaf_read_plan set fired_at = now(), request_id = rid where id = r.id;
  return 1;
end $$;
revoke all on function run_usaf_reads() from public;

-- The fixed-minute jobs of 0083/0086 give way to the plan.
select cron.unschedule(jobid) from cron.job
 where jobname in ('en-garde-usaf-cadet', 'en-garde-usaf-junior', 'en-garde-usaf-y14', 'en-garde-usaf-y12', 'en-garde-usaf-y10',
                   'en-garde-usaf-cadet-w', 'en-garde-usaf-junior-w', 'en-garde-usaf-y14-w', 'en-garde-usaf-y12-w', 'en-garde-usaf-y10-w',
                   'en-garde-usaf-calendar', 'en-garde-usaf-entrants',
                   'en-garde-usaf-entrants-1', 'en-garde-usaf-entrants-2', 'en-garde-usaf-entrants-3', 'en-garde-usaf-entrants-4',
                   'en-garde-usaf-plan', 'en-garde-usaf-run', 'en-garde-cron-tidy');
select cron.schedule('en-garde-usaf-plan', '30 9 * * *', $$select public.plan_usaf_reads()$$);
select cron.schedule('en-garde-usaf-run', '* * * * *', $$select public.run_usaf_reads()$$);
-- The minute ticker leaves a run row a minute; keep a week.
select cron.schedule('en-garde-cron-tidy', '0 5 * * 0', $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);

-- Tomorrow's plan now, so the first random day needs no planner run.
select public.plan_usaf_reads((now() at time zone 'utc')::date + 1);
