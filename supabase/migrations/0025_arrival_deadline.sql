-- Arrival deadline for a fly-in competition.
--
-- Subtracting a buffer from the start time produces nonsense on its own: an
-- 08:00 call minus four hours says "land by 04:00", which is not a flight
-- anyone books. For a competition you fly to, the practical rule is to be on
-- the ground the evening before, and earlier still when the start time has not
-- been published.

create or replace function event_arrival_deadline(
    p_event_date date, p_start time, p_placeholder boolean
) returns timestamp language sql immutable as $$
    select least(
        (p_event_date + event_planning_start(p_start, p_placeholder))
            - (case when p_placeholder then interval '4 hours' else interval '2 hours' end),
        (p_event_date - 1) + time '21:00'
    );
$$;

comment on function event_arrival_deadline is
'Latest sensible arrival for a competition flown to. Always the evening before at the latest; earlier when the schedule is unpublished, since the real call time could be earlier than the 08:00 assumption.';
