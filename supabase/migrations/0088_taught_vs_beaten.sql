-- Lessons review, 2026-09-11 (supabase-backups\reviews\lessons-2026-09-11.md):
-- a lesson is either actions fed and repeated, or scenarios (what to do when
-- the opponent ...); each topic records where it holds (fed / against a
-- resisting partner / in a bout) and what failed, inside the topics jsonb.
-- And the join that turns lessons into an answer: which lesson topics answer
-- each way an opponent scores. Applied 2026-09-11.

alter table private_lessons add column if not exists kind text;    -- action | scenario
alter table group_lessons add column if not exists kind text;

create table if not exists tactic_answers (
  failure_slug text primary key,      -- tactic_taxonomy slug of kind 'failure'
  families text[] not null,           -- patterns matched against lesson topic slugs (case-insensitive)
  ask text not null                   -- what to ask the coach for when nothing taught answers it
);

insert into tactic_answers (failure_slug, families, ask) values
  ('counter-attacked-me',   array['second-intention', 'preparation', 'prep-action', 'pull', 'arm-first', 'distance-control'],
     'second intention: draw the counter, pull the arm, then finish'),
  ('counter-time',          array['counter-attack', 'counter'],
     'when not to counter: read the search, counter only into a real preparation'),
  ('beat-finish',           array['absence', 'blade-away', 'derobe', 'disengage', 'parry-8', 'parry-2', 'eight', 'blade-pressure', 'invitation'],
     'blade away from the beat: absence, derobement, parry 8'),
  ('preparation-attack',    array['distance-control', 'parry-while-retreat', 'preparation', 'attack-in-prep'],
     'shorter preparation and distance control; attack his preparation instead'),
  ('direct-attack-on-me',   array['parry-riposte', 'parry-4', 'parry-6', 'parry-7', 'parry-9', 'distance-parry', 'riposte'],
     'parry-riposte from the retreat, the parry he attacks into'),
  ('parry-riposte-on-me',   array['disengage', 'coupe', 'feint', 'compound', 'flick', 'second-intention'],
     'finish around the parry: feint-disengage, coupe, flick over the blade'),
  ('remise-on-me',          array['parry-riposte', 'riposte', 'cover', 'close'],
     'close the line after the parry and riposte at once'),
  ('running-attack',        array['parry-while-retreat', 'counter-attack', 'distance-control'],
     'retreat without searching, parry-riposte or counter arm first on the rush'),
  ('out-of-distance',       array['distance-control', 'footwork'],
     'distance control: hold him at lunge-plus-one'),
  ('disengage',             array['parry-riposte', 'double-parry', 'circular', 'counter-parry', 'distance-control'],
     'the second parry: circular or double parry before the riposte'),
  ('fake-and-finish-on-me', array['parry-riposte', 'distance-control', 'counter-attack', 'patience'],
     'do not take the feint: parry the real one, or counter the feint'),
  ('second-intention-on-me', array['counter-attack', 'patience', 'distance-control'],
     'counter only when the arm is really extended; otherwise keep distance'),
  ('flick-failure',         array['parry-7', 'parry-9', 'parry-6', 'distance-control'],
     'high parries against the flick, and distance'),
  ('point-in-line',         array['beat-attack', 'beat', 'blade-takeover', 'bind', 'blade'],
     'take the blade before you go: beat or bind against the line'),
  ('aggressive-charge',     array['counter-attack', 'parry-riposte', 'distance-control', 'parry-while-retreat'],
     'counter or parry-riposte on the charge, from the retreat')
on conflict (failure_slug) do update set families = excluded.families, ask = excluded.ask;

alter table tactic_answers enable row level security;
revoke all on tactic_answers from anon;
grant select on tactic_answers to authenticated;
drop policy if exists tactic_answers_read on tactic_answers;
create policy tactic_answers_read on tactic_answers for select to authenticated using (true);
drop policy if exists member_gate on tactic_answers;
create policy member_gate on tactic_answers as restrictive for all to authenticated using (is_member()) with check (is_member());
