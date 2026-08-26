-- Competition selection and goal-setting.
--
-- New fencing parents do not know what a good result looks like, so they read
-- "55th of 98" as failure. If 21 A-rated fencers are entered and their child is
-- a B, 55th may be a fine day and 30th an excellent one. The field's strength
-- distribution is public on fencingtracker; nobody translates it for them.
--
-- This stores an event with its strength bands, works out where a fencer sits
-- in that field, and states par / good / breakthrough BEFORE entering - so the
-- goal is agreed in advance instead of invented afterwards from a number.

create table if not exists events (
    id                uuid primary key default gen_random_uuid(),
    tracker_event_id  text unique,
    tracker_url       text,
    name              text not null,
    tournament        text,
    event_date        date not null,
    venue             text,
    city              text,
    weapon            text default 'foil',
    age_category      text,
    circuit           text,
    entrant_count     int,
    strength_bands    jsonb,
    rating_counts     jsonb,
    awards_points     boolean default false,
    created_at        timestamptz not null default now()
);

create index if not exists events_date_idx on events (event_date);

create table if not exists event_goals (
    id             uuid primary key default gen_random_uuid(),
    profile_id     uuid not null references profiles(id) on delete cascade,
    event_id       uuid not null references events(id) on delete cascade,
    -- points | confidence | challenge | experience
    goal_type      text check (goal_type in ('points','confidence','challenge','experience')),
    seed_estimate  int,
    par_low        int,
    par_high       int,
    target_finish  int,
    stretch_finish int,
    process_goal   text,
    actual_finish  int,
    beat_seed      boolean,
    reflection     text,
    created_at     timestamptz not null default now(),
    updated_at     timestamptz not null default now(),
    unique (profile_id, event_id)
);

create index if not exists event_goals_profile_idx on event_goals (profile_id, created_at desc);

alter table events      enable row level security;
alter table event_goals enable row level security;

drop policy if exists events_select on events;
create policy events_select on events for select to authenticated using (true);
drop policy if exists events_insert on events;
create policy events_insert on events for insert to authenticated with check (true);

drop policy if exists event_goals_select on event_goals;
create policy event_goals_select on event_goals
    for select using (profile_belongs_to_me(profile_id));
drop policy if exists event_goals_insert on event_goals;
create policy event_goals_insert on event_goals
    for insert with check (profile_belongs_to_me(profile_id));
drop policy if exists event_goals_update on event_goals;
create policy event_goals_update on event_goals
    for update using (profile_belongs_to_me(profile_id))
    with check (profile_belongs_to_me(profile_id));

grant all on events      to anon, authenticated, service_role;
grant all on event_goals to anon, authenticated, service_role;
revoke delete on event_goals from anon, authenticated;

comment on table event_goals is
'Goal agreed before an event, based on the real field, so a result can be judged against what was actually likely rather than against a parent hope.';
