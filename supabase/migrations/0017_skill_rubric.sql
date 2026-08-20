-- Skill proficiency rubric.
--
-- This is the part a club member would actually pay for. Logging a lesson is
-- commodity; knowing "what does good look like, and how do I know when I have
-- it" is not. Coaches carry this in their heads and it never reaches the kid
-- between lessons.
--
-- Three levels per skill, and every level is written to be OBSERVABLE. A kid
-- (or parent, or coach) has to be able to watch one rep and say yes or no.
-- Vague rubrics - "good form", "understands timing" - are why self-assessment
-- normally fails. Each level therefore carries a graduation_test: a concrete,
-- countable pass mark.

create table if not exists skills (
    id          uuid primary key default gen_random_uuid(),
    slug        text unique not null,
    label       text not null,
    -- footwork | blade | tactical | distance | mental
    category    text not null,
    weapon      text not null default 'foil',
    summary     text,
    -- skills that should be solid first; advisory, not enforced
    prereqs     text[] default array[]::text[],
    sort_order  int not null default 0,
    created_at  timestamptz not null default now()
);

create index if not exists skills_category_idx on skills (category, sort_order);

create table if not exists skill_levels (
    id              uuid primary key default gen_random_uuid(),
    skill_slug      text not null references skills(slug) on delete cascade,
    level           text not null check (level in ('beginner','intermediate','advanced')),
    -- what you can literally see when watching a rep
    criteria        text not null,
    -- what goes wrong at this stage
    common_faults   text,
    -- the practice that moves them up
    how_to_train    text,
    -- concrete pass mark, so "am I there yet" has an answer
    graduation_test text,
    created_at      timestamptz not null default now(),
    unique (skill_slug, level)
);

create table if not exists skill_assessments (
    id           uuid primary key default gen_random_uuid(),
    profile_id   uuid not null references profiles(id) on delete cascade,
    skill_slug   text not null references skills(slug) on delete cascade,
    level        text not null check (level in ('beginner','intermediate','advanced')),
    -- self | coach | parent
    assessed_by  text not null default 'self',
    -- did they pass the graduation test, or is this just where they feel they are
    passed_test  boolean not null default false,
    evidence     text,
    note         text,
    assessed_on  date not null default (now() at time zone 'utc')::date,
    created_at   timestamptz not null default now()
);

create index if not exists skill_assessments_profile_idx
    on skill_assessments (profile_id, skill_slug, created_at desc);

alter table skills            enable row level security;
alter table skill_levels      enable row level security;
alter table skill_assessments enable row level security;

drop policy if exists skills_select on skills;
create policy skills_select on skills for select to authenticated using (true);
drop policy if exists skill_levels_select on skill_levels;
create policy skill_levels_select on skill_levels for select to authenticated using (true);

drop policy if exists skill_assessments_select on skill_assessments;
create policy skill_assessments_select on skill_assessments
    for select using (profile_belongs_to_me(profile_id));
drop policy if exists skill_assessments_insert on skill_assessments;
create policy skill_assessments_insert on skill_assessments
    for insert with check (profile_belongs_to_me(profile_id));
drop policy if exists skill_assessments_update on skill_assessments;
create policy skill_assessments_update on skill_assessments
    for update using (profile_belongs_to_me(profile_id))
    with check (profile_belongs_to_me(profile_id));

grant all on skills            to anon, authenticated, service_role;
grant all on skill_levels      to anon, authenticated, service_role;
grant all on skill_assessments to anon, authenticated, service_role;
revoke delete on skill_assessments from anon, authenticated;

comment on table skill_levels is
'The product IP: what beginner/intermediate/advanced actually look like for each skill, written to be observable in a single rep.';
