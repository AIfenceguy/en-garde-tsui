-- Ricky, 2026-09-11: "USA Fencing, we don't need to build anything crazy. we
-- just need to get the ranking table and event update once a day. Y10, Y12,
-- Y14, Cadet, Junior, boys and girls. But we do need to check ALL applicable
-- competitions, regional and national, registered entrants update."
-- Women's lists join the men's (13:45-13:57 UTC), the calendar becomes daily
-- (14:00), and entrant counts rotate through every listed regional and
-- national tournament inside 120 days: a dozen per call, four calls a day
-- (refresh-usaf body {"upcoming":true,"days":120}, v8). Applied 2026-09-11.

alter table usaf_tournaments add column if not exists details_read_at timestamptz;

select cron.unschedule(jobid) from cron.job
 where jobname in ('en-garde-usaf-cadet-w', 'en-garde-usaf-junior-w', 'en-garde-usaf-y14-w', 'en-garde-usaf-y12-w', 'en-garde-usaf-y10-w',
                   'en-garde-usaf-calendar', 'en-garde-usaf-entrants',
                   'en-garde-usaf-entrants-1', 'en-garde-usaf-entrants-2', 'en-garde-usaf-entrants-3', 'en-garde-usaf-entrants-4');

select cron.schedule('en-garde-usaf-cadet-w', '45 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"CADET","gender":"WOMENS","weapon":"FOIL","pages":2}'::jsonb, timeout_milliseconds := 120000)
$$);
select cron.schedule('en-garde-usaf-junior-w', '48 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"JUNIOR","gender":"WOMENS","weapon":"FOIL","pages":2}'::jsonb, timeout_milliseconds := 120000)
$$);
select cron.schedule('en-garde-usaf-y14-w', '51 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"Y14","gender":"WOMENS","weapon":"FOIL"}'::jsonb, timeout_milliseconds := 120000)
$$);
select cron.schedule('en-garde-usaf-y12-w', '54 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"Y12","gender":"WOMENS","weapon":"FOIL"}'::jsonb, timeout_milliseconds := 120000)
$$);
select cron.schedule('en-garde-usaf-y10-w', '57 13 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"age_category":"Y10","gender":"WOMENS","weapon":"FOIL"}'::jsonb, timeout_milliseconds := 120000)
$$);

-- The calendar every day.
select cron.schedule('en-garde-usaf-calendar', '0 14 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"calendar":true}'::jsonb, timeout_milliseconds := 120000)
$$);

-- Entrant counts: the dozen listed regional/national tournaments read longest ago, four times a day.
select cron.schedule('en-garde-usaf-entrants-1', '5 14 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"upcoming":true,"days":120}'::jsonb, timeout_milliseconds := 150000)
$$);
select cron.schedule('en-garde-usaf-entrants-2', '9 14 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"upcoming":true,"days":120}'::jsonb, timeout_milliseconds := 150000)
$$);
select cron.schedule('en-garde-usaf-entrants-3', '13 14 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"upcoming":true,"days":120}'::jsonb, timeout_milliseconds := 150000)
$$);
select cron.schedule('en-garde-usaf-entrants-4', '17 14 * * *', $$
  select net.http_post(url := 'https://kyfkiigbiwhczrtnlivc.supabase.co/functions/v1/refresh-usaf',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from app_secrets where name = 'cron_secret')),
    body := '{"upcoming":true,"days":120}'::jsonb, timeout_milliseconds := 150000)
$$);
