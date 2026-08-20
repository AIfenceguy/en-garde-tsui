-- drill_library + drill_sessions
--
-- The Physical view has always queried these two tables, but they were never
-- in any migration, so #physical died with "Could not find the table
-- 'public.drill_library' in the schema cache" the moment it loaded.
--
-- drill_library is a shared catalog (like the taxonomy tables): every fencer
-- picks from it and can add to it, so it carries no profile_id.
-- drill_sessions is per-fencer rep logging and is scoped by profile.

-- ============================================================
-- drill_library
-- ============================================================
create table if not exists drill_library (
    id              uuid primary key default gen_random_uuid(),
    slug            text unique not null,
    label           text not null,
    -- must match the CATEGORIES list in js/modules/physical.js
    category        text not null,
    default_reps    int,
    default_sets    int default 1,
    default_rest_s  int,
    notes           text,
    is_archived     boolean not null default false,
    created_at      timestamptz not null default now()
);

create index if not exists drill_library_category_idx
    on drill_library (category, label) where not is_archived;

alter table drill_library enable row level security;

drop policy if exists drill_library_select on drill_library;
create policy drill_library_select on drill_library
    for select to authenticated using (true);

drop policy if exists drill_library_insert on drill_library;
create policy drill_library_insert on drill_library
    for insert to authenticated with check (true);

drop policy if exists drill_library_update on drill_library;
create policy drill_library_update on drill_library
    for update to authenticated using (true) with check (true);

-- ============================================================
-- drill_sessions — one logged set of reps against a drill
-- ============================================================
create table if not exists drill_sessions (
    id              uuid primary key default gen_random_uuid(),
    profile_id      uuid not null references profiles(id) on delete cascade,
    drill_slug      text not null,
    -- which weakness this rep was aimed at (weakness-drills.js slug)
    weakness_slug   text,
    reps            int not null default 0,
    -- 1 sloppy .. 5 dialled-in; drives the mastery ladder
    rating          int check (rating between 1 and 5),
    note            text,
    -- set when the drill showed up in a real bout: promotes to Match-ready
    bout_id         uuid references bouts(id) on delete set null,
    created_at      timestamptz not null default now()
);

create index if not exists drill_sessions_profile_idx
    on drill_sessions (profile_id, drill_slug, created_at desc);

alter table drill_sessions enable row level security;

drop policy if exists drill_sessions_select on drill_sessions;
create policy drill_sessions_select on drill_sessions
    for select using (profile_belongs_to_me(profile_id));

drop policy if exists drill_sessions_insert on drill_sessions;
create policy drill_sessions_insert on drill_sessions
    for insert with check (profile_belongs_to_me(profile_id));

drop policy if exists drill_sessions_update on drill_sessions;
create policy drill_sessions_update on drill_sessions
    for update using (profile_belongs_to_me(profile_id))
    with check (profile_belongs_to_me(profile_id));

drop policy if exists drill_sessions_delete on drill_sessions;
create policy drill_sessions_delete on drill_sessions
    for delete using (profile_belongs_to_me(profile_id));

-- ============================================================
-- Seed: every slug referenced by the daily templates in physical.js
-- and by add_drill in weakness-drills.js. Without these the templates
-- silently load nothing and the weakness buttons read "(no library match)".
-- ============================================================
insert into drill_library (slug, label, category, default_reps, default_sets, default_rest_s, notes) values
    ('jump-squats',        'Jump squats',              'explosive',    15, 3, 60,  'Land soft, knees tracking over toes.'),
    ('broad-jumps',        'Broad jumps',              'explosive',    8,  3, 90,  'Stick the landing before the next rep.'),
    ('depth-jumps',        'Depth jumps',              'explosive',    6,  3, 90,  'Off a low box. Quality over count.'),
    ('single-leg-bounds',  'Single-leg bounds',        'explosive',    10, 3, 75,  'Ten each leg. Builds the lunge drive.'),
    ('plyo-lunge',         'Plyometric lunge',         'explosive',    10, 3, 75,  'Explode up, switch legs mid-air.'),
    ('animal-movements',   'Animal movements',         'strength',     0,  1, 0,   'Bear crawl, crab walk, frog jump. Fun, full body.'),
    ('weapon-arm-circuit', 'Weapon-arm endurance',     'strength',     20, 3, 45,  'Point control holds and small circles.'),
    ('core-circuit',       'Core circuit',             'core',         0,  3, 45,  'Hollow hold, dead bug, side plank.'),
    ('plank-circuit',      'Plank circuit',            'core',         0,  3, 45,  'Front and both sides, 30s each.'),
    ('footwork-ladder',    'Footwork ladder',          'footwork',     0,  4, 45,  'Advance-retreat, ladder patterns, quick feet.'),
    ('point-control-drill','Point control drill',      'blade',        20, 2, 30,  'Target the small circle. Slow and exact beats fast and loose.'),
    ('sprint-intervals',   'Sprint intervals',         'conditioning', 8,  1, 90,  '10-20m sprints. Mirrors a bout''s bursts.'),
    ('mobility-flow',      'Mobility flow',            'mobility',     0,  1, 0,   'Hips, ankles, shoulders. Ten minutes.'),
    ('active-recovery',    'Active recovery',          'recovery',     0,  1, 0,   'Easy movement — walk, swim, stretch.'),
    ('free-play',          'Free play / outdoor sport','recovery',     0,  1, 0,   'Any sport that is not fencing. Play.'),
    ('full-rest',          'Full rest day',            'recovery',     0,  1, 0,   'Nothing. Rest is training too.')
on conflict (slug) do nothing;

-- Grants (0006 sets default privileges, but be explicit for these two).
grant all on drill_library  to anon, authenticated, service_role;
grant all on drill_sessions to anon, authenticated, service_role;
