-- Trips follow the season. When a fencer is marked "going" to a tournament
-- reached by air, a flight watch exists for that weekend: departures priced
-- two days before, the day before and the first competition day; returns the
-- last competition day and the day after. Watches carry a season key so the
-- sync can run any number of times, and a "text me" switch the checker
-- honours. Applied 2026-09-11.

alter table flight_watches
  add column if not exists season_key text,
  add column if not exists text_me boolean not null default true;
create index if not exists flight_watches_season_key on flight_watches (season_key);

-- The airport a venue city flies into: the closest one within an hour's
-- drive, otherwise the closest hub within about three hours.
create or replace function public.nearest_airport(p_lat double precision, p_lng double precision) returns text
language sql stable as $$
  with d as (
    select code, coalesce(hub, false) as hub,
           3959 * acos(least(1, cos(radians(p_lat)) * cos(radians(lat)) * cos(radians(lng) - radians(p_lng)) + sin(radians(p_lat)) * sin(radians(lat)))) as miles
    from airports where lat is not null and lng is not null
  )
  select code from d
  where miles <= 200
  order by (case when miles <= 60 then 0 when hub then 1 else 2 end), miles
  limit 1
$$;
grant execute on function public.nearest_airport(double precision, double precision) to authenticated;

create or replace function public.sync_trip_watches() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  h record; t record; al record;
  w_id uuid; v_code text; v_key text; v_pax int;
  made int := 0; kept int := 0; skipped text[] := '{}'; keys text[] := '{}';
begin
  if v_uid is null or not is_parent() then raise exception 'parents only'; end if;
  select * into h from household order by (owner_user_id = v_uid) desc limit 1;
  select alert_phone, carrier_gateway, alert_email into al from flight_watches
   where owner_user_id = v_uid and deleted_at is null and alert_phone is not null
   order by created_at desc limit 1;

  for t in
    select se.tournament,
           min(se.start_date) as first_date,
           max(coalesce(se.end_date, se.start_date)) as last_date,
           max(se.city) as city,
           bool_or(coalesce(se.travel, '') = 'fly') as fly,
           count(distinct m.profile_id) as fencers,
           array_agg(distinct se.id) as season_ids
    from member_events m
    join season_events se on se.id = m.season_event_id
    where m.status = 'going'
    group by se.tournament, date_trunc('week', se.start_date::timestamp)
  loop
    if not t.fly or t.last_date < current_date then continue; end if;
    v_key := t.tournament || '|' || t.first_date::text;
    keys := keys || v_key;
    if t.city is null or t.city = '' or lower(t.city) = 'tba' then
      skipped := skipped || (t.tournament || ': city not known yet'); continue;
    end if;
    select nearest_airport(p.lat, p.lng) into v_code from places p
     where p.key = lower(regexp_replace(t.city, '\s+', ' ', 'g')) and p.lat is not null limit 1;
    if v_code is null then skipped := skipped || (t.tournament || ': no airport near ' || t.city); continue; end if;
    v_pax := 1 + t.fencers;

    select id into w_id from flight_watches where season_key = v_key and deleted_at is null limit 1;
    if w_id is null then
      -- Adopt a hand-made watch for the same weekend and airport.
      select id into w_id from flight_watches
       where deleted_at is null and season_key is null and upper(destination) = v_code
         and depart_date between t.first_date - 4 and t.first_date + 1
       order by created_at desc limit 1;
      if w_id is not null then update flight_watches set season_key = v_key where id = w_id; end if;
    end if;

    if w_id is null then
      insert into flight_watches (owner_user_id, label, origins, preferred_origin, origin, destination, depart_date, return_date,
        depart_window_start, depart_window_end, return_window_start, return_window_end, return_after,
        passengers, max_stops, watch_return, hotel_nightly_rate, arrive_days_before, is_active, season_key, text_me,
        alert_phone, carrier_gateway, alert_email)
      values (v_uid, t.tournament || ' ' || to_char(t.first_date, 'YYYY'), h.home_airports, h.home_airports[1], h.home_airports[1], v_code,
        t.first_date - 1, t.last_date, t.first_date - 2, t.first_date, t.last_date, t.last_date + 1, '18:00',
        v_pax, 1, true, h.hotel_night, 1, true, v_key, true, al.alert_phone, al.carrier_gateway, al.alert_email)
      returning id into w_id;
      made := made + 1;
    else
      -- Keep the windows in step with the schedule while nothing is booked.
      update flight_watches set
        is_active = true,
        depart_window_start = coalesce(depart_window_start, t.first_date - 2),
        depart_window_end = coalesce(depart_window_end, t.first_date),
        return_date = coalesce(return_date, t.last_date),
        return_window_start = coalesce(return_window_start, t.last_date),
        return_window_end = coalesce(return_window_end, t.last_date + 1),
        passengers = greatest(coalesce(passengers, 1), v_pax)
      where id = w_id and booked_at is null;
      kept := kept + 1;
    end if;
    update season_events set watch_id = w_id where id = any(t.season_ids);
  end loop;

  -- A trip nobody is going to any more stops being priced, unless it is booked.
  update flight_watches set is_active = false
   where season_key is not null and deleted_at is null and booked_at is null and is_active
     and not (season_key = any(keys));

  return jsonb_build_object('made', made, 'kept', kept, 'skipped', to_jsonb(skipped));
end $$;
revoke all on function public.sync_trip_watches() from public;
grant execute on function public.sync_trip_watches() to authenticated;

-- trip_overview also carries the season's trips: the plan rows a watch was
-- made for, with the fencers marked going. A watch with hand-entered events
-- keeps those and does not repeat them from the plan.
create or replace view public.trip_overview with (security_invoker = true) as
 select w.id as watch_id, w.label as trip_label, e.id as event_id, e.name as event_name, e.tournament, e.event_date, e.city, e.venue,
        e.start_time_is_placeholder,
        event_planning_start(e.start_time, e.start_time_is_placeholder) as plan_for_time,
        event_arrival_deadline(e.event_date, e.start_time, e.start_time_is_placeholder) as be_on_ground_by,
        event_planning_start(e.start_time, e.start_time_is_placeholder) + ((e.expected_hours || ' hours')::interval) as no_return_before,
        p.name as fencer, g.goal_type, g.seed_estimate, g.par_low, g.par_high, g.target_finish, g.stretch_finish, g.process_goal
   from flight_watches w
   join watch_events we on we.watch_id = w.id
   join events e on e.id = we.event_id
   left join event_goals g on g.event_id = e.id
   left join profiles p on p.id = g.profile_id
  where w.deleted_at is null
 union all
 select w.id, w.label, se.id,
        (case regexp_replace(se.event_code, '(MF|WF|ME|WE|MS|WS)$', '')
           when 'Y8' then 'Youth 8' when 'Y10' then 'Youth 10' when 'Y12' then 'Youth 12' when 'Y14' then 'Youth 14'
           when 'CDT' then 'Cadet' when 'JNR' then 'Junior' when 'DV1' then 'Division I' when 'SNR' then 'Senior'
           else regexp_replace(se.event_code, '(MF|WF|ME|WE|MS|WS)$', '') end)
        || ' ' ||
        (case right(se.event_code, 2)
           when 'MF' then 'Men''s Foil' when 'WF' then 'Women''s Foil' when 'ME' then 'Men''s Épée' when 'WE' then 'Women''s Épée'
           when 'MS' then 'Men''s Sabre' when 'WS' then 'Women''s Sabre' else se.event_code end),
        se.tournament, se.start_date, se.city, se.venue,
        true,
        time '08:00',
        ((se.start_date - 1)::timestamp + time '21:00'),
        time '18:00',
        string_agg(p.name, ' + ' order by p.name),
        null::text, null::integer, null::integer, null::integer, null::integer, null::integer, null::text
   from flight_watches w
   join season_events se on se.watch_id = w.id
   join member_events m on m.season_event_id = se.id and m.status = 'going'
   join profiles p on p.id = m.profile_id
  where w.deleted_at is null
    and not exists (select 1 from watch_events we where we.watch_id = w.id)
  group by w.id, w.label, se.id, se.event_code, se.tournament, se.start_date, se.city, se.venue;
