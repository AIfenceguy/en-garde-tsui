-- Video watch-log with quiz reflections
-- =====================================================
-- The Tsui boys watch competition footage on YouTube. This table records
-- what they watched, when, and their answers to a short reflection quiz —
-- so they can revisit the same video later and re-read their own takeaways.
--
-- quiz_answers stores the question text alongside each answer (as opposed
-- to a positional array) so future edits to the quiz template don't
-- retroactively mislabel old answers.

create table if not exists video_reflections (
    id                    uuid primary key default gen_random_uuid(),
    profile_id            uuid not null references profiles(id) on delete cascade,
    watched_date          date not null default (now() at time zone 'utc')::date,
    youtube_url           text not null,
    video_id              text,
    video_title           text,
    video_author          text,
    video_thumbnail_url   text,
    -- array of { question: text, answer: text }
    quiz_answers          jsonb not null default '[]'::jsonb,
    rating_1_10           int check (rating_1_10 between 1 and 10),
    created_at            timestamptz not null default now()
);

create index if not exists video_reflections_profile_date_idx
    on video_reflections (profile_id, watched_date desc, created_at desc);

alter table video_reflections enable row level security;

drop policy if exists video_reflections_select on video_reflections;
create policy video_reflections_select on video_reflections
    for select using (profile_belongs_to_me(profile_id));

drop policy if exists video_reflections_insert on video_reflections;
create policy video_reflections_insert on video_reflections
    for insert with check (profile_belongs_to_me(profile_id));

drop policy if exists video_reflections_update on video_reflections;
create policy video_reflections_update on video_reflections
    for update using (profile_belongs_to_me(profile_id))
    with check (profile_belongs_to_me(profile_id));

drop policy if exists video_reflections_delete on video_reflections;
create policy video_reflections_delete on video_reflections
    for delete using (profile_belongs_to_me(profile_id));

comment on table video_reflections is
'Kid watches a competition video on YouTube, answers a quiz about it. Persisted so they can revisit later and re-read their own reflections along the training journey.';
