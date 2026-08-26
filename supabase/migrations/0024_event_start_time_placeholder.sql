-- Event start times, and the midnight placeholder trap.
--
-- NAC, Junior Olympics and Summer Nationals list events at 12:00am before the
-- schedule is finalised. That is a placeholder meaning "time unknown", not a
-- midnight start. Read literally it is worse than having no time at all: a
-- midnight start makes a late-evening arrival the night before look safe, when
-- the fencer is actually called at 8am.
--
-- Rule: a 00:00 start is stored as a placeholder and planned as 08:00. And
-- because the true time is unknown and could be earlier than assumed, a
-- placeholder gets a larger arrival buffer, not the same one.

alter table events add column if not exists start_time            time;
alter table events add column if not exists start_time_is_placeholder boolean not null default false;
alter table events add column if not exists expected_hours        numeric(4,1) default 8;

comment on column events.start_time_is_placeholder is
'True when the source listed 00:00, which these tournaments use to mean "schedule not published yet". Plan as 08:00 and widen the buffer - never treat it as a real midnight start.';
comment on column events.expected_hours is
'How long the fencer could still be competing. Drives the earliest safe return flight: a deep DE run finishes far later than pools.';

create or replace function event_planning_start(p_start time, p_placeholder boolean)
returns time language sql immutable as $$
    select case
        when p_placeholder or p_start is null or p_start = time '00:00' then time '08:00'
        else p_start
    end;
$$;

update events set start_time_is_placeholder = true
 where start_time is null or start_time = time '00:00';
