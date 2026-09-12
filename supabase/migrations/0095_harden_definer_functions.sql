-- Security advisor pass, 2026-09-12. The scheduler and rebuild functions are
-- for pg_cron and the service key only; a signed-in member must not be able
-- to fire a USA Fencing read or a rebuild through /rest/v1/rpc. Helper
-- functions get a fixed search_path. Applied 2026-09-12.
revoke execute on function public.plan_usaf_reads(date) from public, anon, authenticated;
revoke execute on function public.run_usaf_reads() from public, anon, authenticated;
revoke execute on function public.link_plan_events() from public, anon, authenticated;
revoke execute on function public.rebuild_athlete_ratings(double precision) from public, anon, authenticated;
revoke execute on function public.rebuild_athlete_results() from public, anon, authenticated;
revoke execute on function public.refresh_ratings() from public, anon, authenticated;
alter function public.athlete_key set search_path = public;
alter function public.athlete_key_from_name set search_path = public;
alter function public.nearest_airport set search_path = public;
alter function public.usaf_read_body set search_path = public;
