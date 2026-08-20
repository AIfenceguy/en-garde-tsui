-- Never delete a fencer's record.
--
-- Five modules shipped a delete button that issued a real DELETE, so a
-- mistaken tap permanently destroyed a logged bout or lesson. Given this
-- family has already lost a whole database twice, the app should not be
-- capable of destroying a row at all.
--
-- Two layers:
--   1. deleted_at marks a row as archived; the UI hides it but it stays.
--   2. DELETE is revoked from the roles the browser uses, so even a bug or a
--      hand-crafted request cannot remove history. service_role keeps DELETE
--      so a real mistake can still be cleaned up deliberately from the
--      dashboard.

alter table bouts             add column if not exists deleted_at timestamptz;
alter table private_lessons   add column if not exists deleted_at timestamptz;
alter table group_lessons     add column if not exists deleted_at timestamptz;
alter table tournaments       add column if not exists deleted_at timestamptz;
alter table video_reflections add column if not exists deleted_at timestamptz;
alter table opponents         add column if not exists deleted_at timestamptz;

-- Partial indexes: every list query filters deleted_at is null.
create index if not exists bouts_live_idx
    on bouts (profile_id, date desc) where deleted_at is null;
create index if not exists private_lessons_live_idx
    on private_lessons (profile_id, date desc) where deleted_at is null;
create index if not exists group_lessons_live_idx
    on group_lessons (profile_id, date desc) where deleted_at is null;
create index if not exists tournaments_live_idx
    on tournaments (profile_id, start_date) where deleted_at is null;
create index if not exists video_reflections_live_idx
    on video_reflections (profile_id, watched_date desc) where deleted_at is null;

-- Drop the delete policies so the intent is visible in the schema, then
-- revoke the privilege itself so it is enforced regardless of policy.
drop policy if exists bouts_delete             on bouts;
drop policy if exists private_lessons_delete   on private_lessons;
drop policy if exists group_lessons_delete     on group_lessons;
drop policy if exists tournaments_delete       on tournaments;
drop policy if exists video_reflections_delete on video_reflections;
drop policy if exists opponents_delete         on opponents;

revoke delete on bouts             from anon, authenticated;
revoke delete on private_lessons   from anon, authenticated;
revoke delete on group_lessons     from anon, authenticated;
revoke delete on tournaments       from anon, authenticated;
revoke delete on video_reflections from anon, authenticated;
revoke delete on opponents         from anon, authenticated;

-- Future tables should not silently regain DELETE via 0006's default
-- privileges; grant the rest explicitly instead.
alter default privileges in schema public
    revoke delete on tables from anon, authenticated;

comment on column bouts.deleted_at is
'Archived-at timestamp. Rows are never removed - the app hides them, history keeps them.';
