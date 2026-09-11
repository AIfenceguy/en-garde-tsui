-- A tournament weekend runs Friday to Monday, so grouping by calendar week
-- split the Monday event (Y14 at the October NAC) into a trip of its own.
-- Group by a Thursday-anchored week instead. Applied 2026-09-11.

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
    -- Thursday-anchored week: Thu..Wed, so Fri-Mon events stay one trip.
    group by se.tournament, (se.start_date - ((extract(isodow from se.start_date)::int - 4 + 7) % 7))
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

  update flight_watches set is_active = false
   where season_key is not null and deleted_at is null and booked_at is null and is_active
     and not (season_key = any(keys));

  return jsonb_build_object('made', made, 'kept', kept, 'skipped', to_jsonb(skipped));
end $$;
