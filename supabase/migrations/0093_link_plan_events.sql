-- Link the plan's rows to our copy's events (season_events.ft_event_id) by
-- event code, date within four days, and the first two words of the
-- tournament name, so the registered field and the forecast come from the
-- copy without anyone pasting a link. Runs daily at 16:30 UTC, after the
-- morning FencingTracker upkeep. Applied 2026-09-12.
create or replace function public.link_plan_events() returns integer
language plpgsql security definer set search_path = public as $$
declare n integer := 0; r record; m record; w1 text; w2 text; base text;
begin
  for r in select id, tournament, event_code, start_date from season_events
           where ft_event_id is null and event_code is not null and start_date >= current_date - 14 loop
    base := lower(regexp_replace(coalesce(r.tournament, ''), '\b20\d\d\b', '', 'g'));
    w1 := regexp_replace(split_part(trim(base), ' ', 1), '[^a-z0-9]', '', 'g');
    w2 := regexp_replace(split_part(trim(base), ' ', 2), '[^a-z0-9]', '', 'g');
    if w1 = '' then continue; end if;
    if w2 = '' then w2 := w1; end if;
    select f.ft_event_id into m from ft_events f
     where upper(f.code) = upper(r.event_code)
       and f.event_date between r.start_date - 4 and r.start_date + 4
       and lower(f.tournament) like '%' || w1 || '%' and lower(f.tournament) like '%' || w2 || '%'
     order by abs(f.event_date - r.start_date) limit 1;
    if found then update season_events set ft_event_id = m.ft_event_id where id = r.id; n := n + 1; end if;
  end loop;
  return n;
end $$;
revoke all on function public.link_plan_events() from public;
select cron.unschedule(jobid) from cron.job where jobname = 'en-garde-link-plan';
select cron.schedule('en-garde-link-plan', '30 16 * * *', $$select public.link_plan_events()$$);
