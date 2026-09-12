-- How far along each copied results page is: the copier's morning upkeep
-- re-reads a recent page only while its DE looks unfinished (each bout is
-- stored once per fencer, so a finished DE among N fencers holds about
-- 2*(N-1) rows). Ricky, 2026-09-12: keep the FencingTracker upkeep minimal.
-- Applied 2026-09-12.
create or replace view public.ft_results_progress as
select e.rid, e.event_date, e.finishers, e.results_read_at,
       (select count(*) from public.ft_bouts b where b.ft_event_id = e.rid and b.phase = 'de') as de_rows
from public.ft_result_events e
where e.target and e.ok;
revoke all on public.ft_results_progress from anon, authenticated;
