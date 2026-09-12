-- A forward test of our rating against the outside strength number, week by
-- week, on every new regional/national/international bout in the copy.
-- Both numbers are taken BEFORE the event: ours from a daily snapshot of
-- own_ratings (the whole-history fit revises the past, so the snapshot is the
-- honest forward number); theirs from the last entry list read before the
-- event (ft_entries.strength_de, read every other day in the weeks before).
-- Private: never a column, never on screen (Ricky, 2026-09-11). Applied
-- 2026-09-12 with a first snapshot dated 2026-09-11 (the model had no bouts
-- after 2026-09-07, so today's ratings are a true pre-weekend number).
create table if not exists public.own_rating_snapshots (
  as_of date not null,
  tracker_id bigint not null,
  rating integer not null,
  sd integer,
  primary key (as_of, tracker_id)
);
create table if not exists public.strength_scorecard (
  week_start date primary key,
  computed_at timestamptz not null default now(),
  de_bouts integer, de_both_rated integer, de_ours_right integer, de_ft_right integer,
  de_agree integer, de_agree_right integer, de_disagree integer, de_ours_right_when_disagree integer,
  de_ours_logloss numeric,
  pool_bouts integer, pool_both_rated integer, pool_ours_right integer, pool_ft_right integer,
  pool_disagree integer, pool_ours_right_when_disagree integer
);
alter table public.own_rating_snapshots enable row level security;
alter table public.strength_scorecard enable row level security;
revoke all on public.own_rating_snapshots, public.strength_scorecard from anon, authenticated;

create or replace function public.snapshot_own_ratings(p_as_of date default current_date)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into own_rating_snapshots (as_of, tracker_id, rating, sd)
  select p_as_of, o.tracker_id, o.rating, o.sd
  from own_ratings o
  where exists (select 1 from ft_entries e join ft_events v on v.ft_event_id = e.ft_event_id
                where e.tracker_id = o.tracker_id and v.event_date between p_as_of and p_as_of + 35)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.snapshot_own_ratings(date) from public, anon, authenticated;

create or replace function public.strength_scorecard_week(p_week_start date)
returns void language plpgsql security definer set search_path = public as $$
begin
  with bouts as (
    select e.event_date, b.phase, b.tracker_id as w, b.opponent_tracker_id as l
    from ft_bouts b join ft_result_events e on e.rid = b.ft_event_id
    where b.result = 'V' and b.tracker_id is not null and b.opponent_tracker_id is not null
      and e.tier in ('national', 'regional', 'international')
      and e.event_date >= p_week_start and e.event_date < p_week_start + 7
  ),
  rated as (
    select x.*,
      (select s.rating from own_rating_snapshots s where s.tracker_id = x.w and s.as_of < x.event_date and s.as_of >= x.event_date - 45 order by s.as_of desc limit 1) as ow,
      (select s.rating from own_rating_snapshots s where s.tracker_id = x.l and s.as_of < x.event_date and s.as_of >= x.event_date - 45 order by s.as_of desc limit 1) as ol,
      (select n.strength_de from ft_entries n where n.tracker_id = x.w and n.read_at < (x.event_date::timestamp + interval '14 hours') at time zone 'UTC' and n.read_at >= (x.event_date - 45)::timestamp order by n.read_at desc limit 1) as fw,
      (select n.strength_de from ft_entries n where n.tracker_id = x.l and n.read_at < (x.event_date::timestamp + interval '14 hours') at time zone 'UTC' and n.read_at >= (x.event_date - 45)::timestamp order by n.read_at desc limit 1) as fl
    from bouts x
  ),
  scored as (
    select phase,
      (ow is not null and ol is not null and fw is not null and fl is not null) as both_rated,
      case when ow > ol then 1 when ow < ol then 0 end as ours_right,
      case when fw > fl then 1 when fw < fl then 0 end as ft_right,
      case when ow is not null and ol is not null then
        -ln(1.0 / (1.0 + power(10.0, -((ow - ol)::numeric / case when phase = 'de' then 400.0 else 640.0 end)))) end as ll
    from rated
  )
  insert into strength_scorecard (week_start, computed_at,
    de_bouts, de_both_rated, de_ours_right, de_ft_right, de_agree, de_agree_right, de_disagree, de_ours_right_when_disagree, de_ours_logloss,
    pool_bouts, pool_both_rated, pool_ours_right, pool_ft_right, pool_disagree, pool_ours_right_when_disagree)
  select p_week_start, now(),
    count(*) filter (where phase = 'de'),
    count(*) filter (where phase = 'de' and both_rated),
    sum(ours_right) filter (where phase = 'de' and both_rated),
    sum(ft_right) filter (where phase = 'de' and both_rated),
    count(*) filter (where phase = 'de' and both_rated and ours_right = ft_right),
    sum(ours_right) filter (where phase = 'de' and both_rated and ours_right = ft_right),
    count(*) filter (where phase = 'de' and both_rated and ours_right <> ft_right),
    sum(ours_right) filter (where phase = 'de' and both_rated and ours_right <> ft_right),
    round(avg(ll) filter (where phase = 'de' and both_rated), 4),
    count(*) filter (where phase = 'pool'),
    count(*) filter (where phase = 'pool' and both_rated),
    sum(ours_right) filter (where phase = 'pool' and both_rated),
    sum(ft_right) filter (where phase = 'pool' and both_rated),
    count(*) filter (where phase = 'pool' and both_rated and ours_right <> ft_right),
    sum(ours_right) filter (where phase = 'pool' and both_rated and ours_right <> ft_right)
  from scored
  on conflict (week_start) do update set
    computed_at = excluded.computed_at,
    de_bouts = excluded.de_bouts, de_both_rated = excluded.de_both_rated, de_ours_right = excluded.de_ours_right, de_ft_right = excluded.de_ft_right,
    de_agree = excluded.de_agree, de_agree_right = excluded.de_agree_right, de_disagree = excluded.de_disagree, de_ours_right_when_disagree = excluded.de_ours_right_when_disagree,
    de_ours_logloss = excluded.de_ours_logloss,
    pool_bouts = excluded.pool_bouts, pool_both_rated = excluded.pool_both_rated, pool_ours_right = excluded.pool_ours_right, pool_ft_right = excluded.pool_ft_right,
    pool_disagree = excluded.pool_disagree, pool_ours_right_when_disagree = excluded.pool_ours_right_when_disagree;
end $$;
revoke all on function public.strength_scorecard_week(date) from public, anon, authenticated;

create or replace function public.strength_scorecard_run()
returns void language plpgsql security definer set search_path = public as $$
declare k integer;
begin
  for k in 1..3 loop
    perform public.strength_scorecard_week((date_trunc('week', current_date)::date) - 7 * k);
  end loop;
end $$;
revoke all on function public.strength_scorecard_run() from public, anon, authenticated;

-- Snapshot daily at 18:30 UTC (11:30 Pacific, after the model's 09:30-10:30
-- run); scorecard Thursdays 19:00 UTC, when the week's results have landed.
select cron.schedule('en-garde-rating-snapshot', '30 18 * * *', 'select public.snapshot_own_ratings()');
select cron.schedule('en-garde-scorecard', '0 19 * * 4', 'select public.strength_scorecard_run()');
