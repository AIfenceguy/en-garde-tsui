-- One fencer's record from the bout copy, for a window (Ricky, 2026-09-12:
-- "a button to show performance, last 3 months, 6, 12, 24, lifetime"). Counts
-- only events USA Fencing lists at regional level and above, like the rating;
-- local events are practice. Members call this instead of reading ft_bouts.
-- Applied 2026-09-12.
create or replace function public.fencer_record(p_tracker_id bigint, p_days integer default null)
returns jsonb language sql stable security definer set search_path = public as $$
with ev as (
  select rid, event_date from ft_result_events
  where target and tier in ('national', 'regional', 'international')
    and (p_days is null or event_date >= current_date - p_days)
),
b as (
  select x.phase, x.result, x.score_for, x.score_against, e.event_date, x.ft_event_id,
         f.rating as opp_rating
  from ft_bouts x join ev e on e.rid = x.ft_event_id
  left join ft_fencers f on f.tracker_id = x.opponent_tracker_id
  where x.tracker_id = p_tracker_id and x.result in ('V', 'D')
),
tiers as (
  select upper(left(coalesce(opp_rating, 'U'), 1)) as tier,
         count(*) filter (where result = 'V') as w, count(*) filter (where result = 'D') as l
  from b group by 1
)
select jsonb_build_object(
  'window_days', p_days,
  'bouts', (select count(*) from b),
  'wins', (select count(*) filter (where result = 'V') from b),
  'events', (select count(distinct ft_event_id) from b),
  'pool', jsonb_build_object('w', (select count(*) filter (where phase = 'pool' and result = 'V') from b),
                             'l', (select count(*) filter (where phase = 'pool' and result = 'D') from b)),
  'de',   jsonb_build_object('w', (select count(*) filter (where phase = 'de' and result = 'V') from b),
                             'l', (select count(*) filter (where phase = 'de' and result = 'D') from b)),
  'one_touch', jsonb_build_object(
      'w', (select count(*) from b where abs(score_for - score_against) = 1 and result = 'V'),
      'l', (select count(*) from b where abs(score_for - score_against) = 1 and result = 'D')),
  'pool_avg', jsonb_build_object(
      'for', (select round(avg(score_for)::numeric, 2) from b where phase = 'pool'),
      'against', (select round(avg(score_against)::numeric, 2) from b where phase = 'pool')),
  'last_bout', (select max(event_date) from b),
  'first_bout', (select min(event_date) from b),
  'vs_rating', (select coalesce(jsonb_object_agg(tier, jsonb_build_object('w', w, 'l', l)), '{}'::jsonb) from tiers where w + l > 0),
  'basis', 'regional and national events only, from the results copy'
)
$$;
revoke all on function public.fencer_record(bigint, integer) from public;
grant execute on function public.fencer_record(bigint, integer) to authenticated, service_role;
