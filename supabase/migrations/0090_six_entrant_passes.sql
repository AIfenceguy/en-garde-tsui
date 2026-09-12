-- Six entrant passes a day instead of four (2026-09-11). Each pass reads six
-- listed national or regional tournaments and the official entry lists of
-- their foil Y10 to Junior events inside refresh-usaf's 100 s time budget
-- (v12), so the 120-day window is covered every couple of days. The day's
-- plan was redrawn for 2026-09-12. Applied 2026-09-11.

create or replace function public.plan_usaf_reads(p_day date default ((now() at time zone 'utc'))::date)
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  kinds text[] := array['standings:Y10:MENS', 'standings:Y10:WOMENS', 'standings:Y12:MENS', 'standings:Y12:WOMENS',
                        'standings:Y14:MENS', 'standings:Y14:WOMENS', 'standings:CADET:MENS', 'standings:CADET:WOMENS',
                        'standings:JUNIOR:MENS', 'standings:JUNIOR:WOMENS', 'calendar', 'entrants', 'entrants', 'entrants', 'entrants', 'entrants', 'entrants'];
  k text; t timestamptz; n integer := 0;
begin
  if exists (select 1 from usaf_read_plan where planned_for = p_day) then return 0; end if;
  select array_agg(x order by random()) into kinds from unnest(kinds) x;
  t := (p_day::text || ' 10:00:00+00')::timestamptz + (random() * 1200) * interval '1 second';
  foreach k in array kinds loop
    insert into usaf_read_plan (planned_for, kind, run_at) values (p_day, k, t);
    n := n + 1;
    t := t + (90 + random() * 300) * interval '1 second';
  end loop;
  return n;
end $function$;
