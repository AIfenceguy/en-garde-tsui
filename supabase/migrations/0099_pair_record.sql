-- Every pair of fencers who have met, regional and up: how many times, who
-- won, the last meeting. From our copy. Feeds the head-to-head line on Scout,
-- Season and Insight (Ricky, 2026-09-12: "keep track of the same pair").
-- Applied 2026-09-12.
create or replace function public.pair_record(p_a bigint, p_b bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (
    select e.event_date, e.tournament, e.event_name, b.phase, b.tracker_id as winner, b.score_for, b.score_against
    from ft_bouts b join ft_result_events e on e.rid = b.ft_event_id
    where b.result = 'V' and b.tracker_id in (p_a, p_b) and b.opponent_tracker_id in (p_a, p_b) and b.tracker_id <> b.opponent_tracker_id
      and e.tier in ('national', 'regional', 'international')
  )
  select jsonb_build_object(
    'meetings', count(*),
    'a_wins', count(*) filter (where winner = p_a),
    'b_wins', count(*) filter (where winner = p_b),
    'de_a_wins', count(*) filter (where winner = p_a and phase = 'de'),
    'de_b_wins', count(*) filter (where winner = p_b and phase = 'de'),
    'last', (select jsonb_build_object('date', event_date, 'tournament', tournament, 'event', event_name, 'phase', phase, 'winner', winner, 'score', score_for || '-' || score_against) from m order by event_date desc limit 1),
    'bouts', (select jsonb_agg(jsonb_build_object('date', event_date, 'tournament', tournament, 'event', event_name, 'phase', phase, 'winner', winner, 'score', score_for || '-' || score_against) order by event_date desc) from m)
  ) from m;
$$;
revoke all on function public.pair_record(bigint, bigint) from public, anon;
grant execute on function public.pair_record(bigint, bigint) to authenticated;
