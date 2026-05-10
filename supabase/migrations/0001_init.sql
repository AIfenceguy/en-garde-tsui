-- En Garde v2 schema
-- One family account per auth.users row; multiple profiles (raedyn, kaylan, parent)
-- foreign-keyed to that user. UI/RLS enforces per-profile privacy boundary.

create extension if not exists "pgcrypto";

-- ============================================================
-- profiles
-- ============================================================
create table if not exists profiles (
    id uuid primary key default gen_random_uuid(),
    owner_user_id uuid not null references auth.users(id) on delete cascade,
    name text not null,
    role text not null check (role in ('raedyn','kaylan','parent')),
    birth_year int,
    primary_weapon text default 'foil',
    rating text,
    accent_hex text,
    created_at timestamptz not null default now(),
    unique (owner_user_id, role)
);

create index if not exists profiles_owner_idx on profiles (owner_user_id);

-- ============================================================
-- taxonomies — seeded with starter values, users can add more
-- ============================================================
create table if not exists topic_taxonomy (
    id uuid primary key default gen_random_uuid(),
    slug text unique not null,
    label text not null,
    category text,
    created_by uuid references profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists drill_taxonomy (
    id uuid primary key default gen_random_uuid(),
    slug text unique not null,
    label text not null,
    category text,
    -- 'physical' | 'fencing' | 'mental'
    domain text not null default 'fencing',
    created_by uuid references profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

create table if not exists tactic_taxonomy (
    id uuid primary key default gen_random_uuid(),
    slug text unique not null,
    label text not null,
    -- 'scoring' = action that scores; 'failure' = how opponent scored on me
    kind text not null check (kind in ('scoring','failure')),
    created_by uuid references profiles(id) on delete set null,
    created_at timestamptz not null default now()
);

-- ============================================================
-- 3.6 opponents (defined first because bouts reference it)
-- ============================================================
create table if not exists opponents (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    name text not null,
    club text,
    rating text,
    age_category text,
    hand text check (hand in ('right','left','unknown')) default 'unknown',
    height_cm int,
    archetypes text[] default array[]::text[],
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (profile_id, name, club)
);

create index if not exists opponents_profile_idx on opponents (profile_id);

create table if not exists opponent_swots (
    id uuid primary key default gen_random_uuid(),
    opponent_id uuid not null references opponents(id) on delete cascade,
    profile_id uuid not null references profiles(id) on delete cascade,
    strengths text[] default array[]::text[],
    weaknesses text[] default array[]::text[],
    opportunities text[] default array[]::text[],
    threats text[] default array[]::text[],
    updated_at timestamptz not null default now(),
    unique (opponent_id)
);

create index if not exists swots_profile_idx on opponent_swots (profile_id);

create table if not exists opponent_5w2h (
    id uuid primary key default gen_random_uuid(),
    opponent_id uuid not null references opponents(id) on delete cascade,
    profile_id uuid not null references profiles(id) on delete cascade,
    bout_date date,
    who text,
    what text,
    when_in_bout text,
    where_scoring text,
    why_they_win text,
    how_to_score text,
    respect_1_10 int check (respect_1_10 between 1 and 10),
    created_at timestamptz not null default now()
);

create index if not exists fivew2h_opponent_idx on opponent_5w2h (opponent_id);

-- ============================================================
-- 3.3 bouts
-- ============================================================
create table if not exists bouts (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    date date not null,
    location text,
    -- 'club_open' | 'tournament_prep' | 'pool' | 'de' | 'other'
    context text,
    opponent_id uuid references opponents(id) on delete set null,
    -- denormalized — captured at bout time even if opponent record changes later
    opponent_name text,
    opponent_rating text,
    opponent_club text,
    opponent_archetypes text[] default array[]::text[],
    my_score int,
    their_score int,
    outcome text check (outcome in ('win','loss','draw')),
    -- array of { tactic_slug, attempts, successes }
    scoring_actions jsonb not null default '[]'::jsonb,
    failure_patterns text[] default array[]::text[],
    reflection text,
    coach_feedback text,
    created_at timestamptz not null default now()
);

create index if not exists bouts_profile_date_idx on bouts (profile_id, date desc);
create index if not exists bouts_opponent_idx on bouts (opponent_id);

-- ============================================================
-- 3.4 physical sessions
-- ============================================================
create table if not exists physical_sessions (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    date date not null,
    -- array of { drill_slug, target_reps, actual_reps, notes }
    drills_completed jsonb not null default '[]'::jsonb,
    energy_1_10 int check (energy_1_10 between 1 and 10),
    soreness_location text,
    soreness_severity int check (soreness_severity between 0 and 10),
    sleep_hours numeric(3,1),
    injury_flag boolean default false,
    injury_notes text,
    created_at timestamptz not null default now(),
    unique (profile_id, date)
);

create index if not exists physical_profile_date_idx on physical_sessions (profile_id, date desc);

-- ============================================================
-- 3.5 mental sessions
-- ============================================================
create table if not exists mental_sessions (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    date date not null,
    -- 'breathwork' | 'visualization' | 'body_scan' | 'mixed'
    meditation_technique text,
    meditation_duration_min int,
    meditation_focus_1_10 int check (meditation_focus_1_10 between 1 and 10),
    visualization_done boolean default false,
    breathing_done boolean default false,
    in_bout_cue_practice boolean default false,
    scenarios_rehearsed text[] default array[]::text[],
    -- array of { bout_id, one_thing }
    loss_reflections jsonb not null default '[]'::jsonb,
    -- v1 carryover: raedyn instinctive moves catalog
    instinct_catalog jsonb not null default '[]'::jsonb,
    -- v1 carryover: kaylan speed self-rating
    speed_self_rating int check (speed_self_rating between 1 and 10),
    notes text,
    created_at timestamptz not null default now(),
    unique (profile_id, date)
);

create index if not exists mental_profile_date_idx on mental_sessions (profile_id, date desc);

-- ============================================================
-- 3.1 private lessons
-- ============================================================
create table if not exists private_lessons (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    date date not null,
    coach text,
    duration_min int,
    -- array of { topic_slug, mastery_1_10, application_notes }
    topics jsonb not null default '[]'::jsonb,
    new_skill_introduced boolean default false,
    practice_plan text,
    coach_quote text,
    created_at timestamptz not null default now()
);

create index if not exists private_profile_date_idx on private_lessons (profile_id, date desc);

-- ============================================================
-- 3.2 group lessons
-- ============================================================
create table if not exists group_lessons (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    date date not null,
    instructor text,
    duration_min int,
    club text,
    -- array of { drill_slug, comfort_1_10, application_context }
    drills jsonb not null default '[]'::jsonb,
    partners text[] default array[]::text[],
    created_at timestamptz not null default now()
);

create index if not exists group_profile_date_idx on group_lessons (profile_id, date desc);

-- ============================================================
-- tournaments
-- ============================================================
create table if not exists tournaments (
    id uuid primary key default gen_random_uuid(),
    profile_id uuid not null references profiles(id) on delete cascade,
    name text not null,
    start_date date not null,
    end_date date,
    location text,
    events text[] default array[]::text[],
    notes text,
    created_at timestamptz not null default now()
);

create index if not exists tournaments_profile_idx on tournaments (profile_id, start_date);

-- ============================================================
-- updated_at triggers for opponents and swots
-- ============================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists trg_opponents_updated_at on opponents;
create trigger trg_opponents_updated_at
    before update on opponents
    for each row execute function set_updated_at();

drop trigger if exists trg_swots_updated_at on opponent_swots;
create trigger trg_swots_updated_at
    before update on opponent_swots
    for each row execute function set_updated_at();
