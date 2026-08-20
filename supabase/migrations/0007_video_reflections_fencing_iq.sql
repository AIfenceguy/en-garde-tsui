-- Promote the fencing-IQ fields out of quiz_answers into real columns so they
-- can be queried and aggregated later ("which actions do we keep seeing win?").
-- quiz_answers still keeps the full question/answer transcript, because the
-- point of this feature is that a fencer can reread their own thinking months
-- later.

alter table video_reflections add column if not exists fencer_a         text;
alter table video_reflections add column if not exists fencer_b         text;
alter table video_reflections add column if not exists winner           text;
alter table video_reflections add column if not exists final_score      text;
alter table video_reflections add column if not exists competition      text;
-- tactic_taxonomy slugs the fencer noticed scoring in this video
alter table video_reflections add column if not exists key_actions      text[] default array[]::text[];
alter table video_reflections add column if not exists what_i_learned   text;
alter table video_reflections add column if not exists how_to_practice  text;

create index if not exists video_reflections_actions_idx
    on video_reflections using gin (key_actions);

comment on column video_reflections.key_actions is
'tactic_taxonomy slugs observed scoring in the video. GIN-indexed so we can ask which actions recur across everything the kids have watched.';
comment on column video_reflections.how_to_practice is
'The bridge from watching to doing: how this gets drilled at the next practice.';
