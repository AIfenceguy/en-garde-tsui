-- En Garde gathers the data itself (Ricky, 2026-09-11): a few identified reads
-- a day of USA Fencing's public pages, cached, nothing shown as a list, and no
-- action ever asked of a family. Standings every morning, the calendar weekly,
-- and the entrant counts of the trips marked going every morning.
-- 13:30 UTC is 6:30am Pacific in summer. Applied 2026-09-11.

select cron.unschedule(jobid) from cron.job
 where jobname in ('en-garde-usaf-cadet', 'en-garde-usaf-junior', 'en-garde-usaf-y14', 'en-garde-usaf-y12', 'en-garde-usaf-y10',
                   'en-garde-usaf-calendar', 'en-garde-usaf-entrants');

-- One list per job, three minutes apart, so the portal never sees a burst.
select cron.schedule('en-garde-usaf-cadet', '30 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"CADET","gender":"MENS","weapon":"FOIL","pages":2}'::jsonb, timeout_milliseconds := 120000)
$$);
select cron.schedule('en-garde-usaf-junior', '33 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"JUNIOR","gender":"MENS","weapon":"FOIL","pages":2}'::jsonb, timeout_milliseconds := 120000)
$$);
select cron.schedule('en-garde-usaf-y14', '36 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"Y14","gender":"MENS","weapon":"FOIL"}'::jsonb, timeout_milliseconds := 120000)
$$);
select cron.schedule('en-garde-usaf-y12', '39 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"Y12","gender":"MENS","weapon":"FOIL"}'::jsonb, timeout_milliseconds := 120000)
$$);
select cron.schedule('en-garde-usaf-y10', '42 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"Y10","gender":"MENS","weapon":"FOIL"}'::jsonb, timeout_milliseconds := 120000)
$$);

-- The season calendar once a week, Monday morning.
select cron.schedule('en-garde-usaf-calendar', '50 13 * * 1', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"calendar":true}'::jsonb, timeout_milliseconds := 120000)
$$);

-- Entrant counts and caps for the next four tournaments a fencer is going to.
select cron.schedule('en-garde-usaf-entrants', '55 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := jsonb_build_object('tournament_ids', (
      select coalesce(jsonb_agg(usaf_id), '[]'::jsonb) from (
        select se.usaf_id, min(se.start_date) as d
        from season_events se
        join member_events m on m.season_event_id = se.id and m.status = 'going'
        where se.usaf_id is not null and se.start_date >= current_date
        group by se.usaf_id order by d limit 4) x)),
    timeout_milliseconds := 120000)
$$);
