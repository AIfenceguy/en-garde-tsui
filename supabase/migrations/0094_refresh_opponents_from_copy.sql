-- The Insight tier's "re-read their records" used to fetch each fencer from
-- fencingtracker.com at runtime. Now it refreshes the Insight tables from our
-- own copy of the results: profile facts from ft_fencers, placings from
-- ft_results, regional and up only (Ricky, 2026-09-11: nothing below regional
-- counts). Nothing leaves the database. Applied 2026-09-12.
--
-- Same day: cron job en-garde-refresh-due unscheduled (it was reading
-- fencingtracker.com every three minutes in a night window with the old
-- bot identity), and the refresh-event, refresh-peer and refresh-due edge
-- functions redeployed as 410 stubs.
create or replace function public.refresh_opponents_from_copy(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer := 0;
begin
  if not public.is_member() then raise exception 'members only'; end if;
  insert into opponent_profiles (tracker_id, name, club, birth_year, rating, strength_de, strength_pool, tracker_url, fetched_at)
  select f.tracker_id, f.name, f.club, f.birth_year, f.rating, f.strength_de, null, null, now()
  from ft_fencers f where f.tracker_id = any(p_ids)
  on conflict (tracker_id) do update set
    name = coalesce(excluded.name, opponent_profiles.name),
    club = coalesce(excluded.club, opponent_profiles.club),
    birth_year = coalesce(excluded.birth_year, opponent_profiles.birth_year),
    rating = coalesce(excluded.rating, opponent_profiles.rating),
    strength_de = coalesce(excluded.strength_de, opponent_profiles.strength_de),
    tracker_url = null,
    fetched_at = now();
  delete from opponent_results where tracker_id = any(p_ids);
  insert into opponent_results (tracker_id, result_date, tournament, category, event_title, place, field_size, event_class, rating_earned)
  select distinct on (r.tracker_id, e.event_date, coalesce(e.tournament, e.title), cat.c)
    r.tracker_id, e.event_date, coalesce(e.tournament, e.title), cat.c, coalesce(e.event_name, e.title), r.place, e.finishers, null, null
  from ft_results r
  join ft_result_events e on e.rid = r.ft_event_id
  cross join lateral (select case upper(e.category)
      when 'CDT' then 'cadet' when 'JNR' then 'junior' when 'DV1' then 'div1' when 'D1A' then 'div1'
      when 'DV2' then 'div2' when 'DV3' then 'div3' when 'SNR' then 'senior' when 'VET' then 'vet'
      else lower(e.category) end as c) cat
  where r.tracker_id = any(p_ids)
    and exists (select 1 from opponent_profiles p where p.tracker_id = r.tracker_id)
    and e.ok and e.tier in ('national', 'regional', 'international')
    and e.event_date is not null and e.category is not null and r.place is not null
  order by r.tracker_id, e.event_date, coalesce(e.tournament, e.title), cat.c, r.place;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.refresh_opponents_from_copy(bigint[]) from public, anon;
grant execute on function public.refresh_opponents_from_copy(bigint[]) to authenticated;
