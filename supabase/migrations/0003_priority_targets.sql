-- Priority-target profiling: structured style profile per opponent
-- The Tsui boys' Summer Nationals 2026 prep needs structured opponent profiles.
-- We add a JSONB column on `opponents` so the style-profile interview answers
-- can be saved without schema churn for each future field.

alter table opponents
    add column if not exists style_profile jsonb;

alter table opponents
    add column if not exists tracker_url text;

alter table opponents
    add column if not exists is_priority_target boolean not null default false;

-- Index so we can list priority targets quickly per profile
create index if not exists opponents_priority_idx on opponents (profile_id, is_priority_target) where is_priority_target;

-- Comment for posterity
comment on column opponents.style_profile is
'Structured style-profile interview answers: tempo, distance, hand, tells, setup, defense, adaptation, pressure, what_worked_for_me, what_they_land_on_me. Free-form JSON keyed by question slug.';

comment on column opponents.tracker_url is
'fencingtracker.com profile URL for cross-reference.';

comment on column opponents.is_priority_target is
'True when this opponent is on the priority-target list for the next major tournament. Surface at top of Scout list.';
