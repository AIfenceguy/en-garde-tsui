-- USA Fencing reads at random moments between midnight and 7 am Pacific
-- (Ricky, 2026-09-11: "let's make this random too, 12am to 7am, so we have a
-- 7 hour window"). Each of the day's seventeen reads gets its own random time
-- in the window, sorted, at least ninety seconds apart, in a random order of
-- kinds, so there is no session shape. The planner runs at 06:20 UTC, 11:20 pm
-- Pacific in summer, and draws the coming local day. Applied 2026-09-11.

create or replace function public.plan_usaf_reads(p_day date default (((now() at time zone 'America/Los_Angeles') + interval '3 hours'))::date)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  kinds text[] := array['standings:Y10:MENS', 'standings:Y10:WOMENS', 'standings:Y12:MENS', 'standings:Y12:WOMENS',
                        'standings:Y14:MENS', 'standings:Y14:WOMENS', 'standings:CADET:MENS', 'standings:CADET:WOMENS',
                        'standings:JUNIOR:MENS', 'standings:JUNIOR:WOMENS', 'calendar', 'entrants', 'entrants', 'entrants', 'entrants', 'entrants', 'entrants'];
  n integer := 0; win_start timestamptz; times timestamptz[]; t timestamptz; prev timestamptz := null; i integer;
begin
  if exists (select 1 from usaf_read_plan where planned_for = p_day) then return 0; end if;
  win_start := (p_day::text || ' 00:00')::timestamp at time zone 'America/Los_Angeles';
  select array_agg(x order by random()) into kinds from unnest(kinds) x;
  select array_agg(s.t order by s.t) into times
    from (select win_start + (random() * 7 * 3600) * interval '1 second' as t from generate_series(1, array_length(kinds, 1))) s;
  for i in 1 .. array_length(kinds, 1) loop
    t := times[i];
    if prev is not null and t < prev + interval '90 seconds' then t := prev + interval '90 seconds' + (random() * 60) * interval '1 second'; end if;
    insert into usaf_read_plan (planned_for, kind, run_at) values (p_day, kinds[i], t);
    prev := t; n := n + 1;
  end loop;
  return n;
end $function$;

select cron.unschedule(jobid) from cron.job where jobname = 'en-garde-usaf-plan';
select cron.schedule('en-garde-usaf-plan', '20 6 * * *', $$select public.plan_usaf_reads()$$);
