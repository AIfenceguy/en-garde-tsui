-- Clean the topic vocabulary, and make self-ratings comparable.
--
-- Two problems that would make AI coaching confidently wrong.
--
-- 1. Free-text topic entry is fragmenting the taxonomy. "distane-parry-repost"
--    is a typo, "distance-parry" overlaps it, and both overlap the seeded
--    "parry-riposte". Fifty lessons from now nothing would group.
--
-- 2. The boys rate themselves on different scales. Raedyn averages 6.73 with a
--    spread of 1.76; Kaylan averages 8.00 with a spread of 0.67 - yet Raedyn is
--    the stronger fencer. Read literally, advice would tell the stronger boy he
--    is weak, and Kaylan's near-flat ratings carry almost no signal at all.

alter table topic_taxonomy add column if not exists alias_of text references topic_taxonomy(slug);
alter table topic_taxonomy add column if not exists is_sequence boolean not null default false;

insert into topic_taxonomy (slug, label, category) values
  ('distance-parry-riposte','Parry-riposte at distance','defense')
on conflict (slug) do nothing;

update topic_taxonomy set alias_of = 'distance-parry-riposte'
 where slug in ('distane-parry-repost','distance-parry');
update topic_taxonomy set is_sequence = true where slug = 'parry-four-flick-to-chest';
update topic_taxonomy set category = 'blade'    where slug in ('flick','coupe') and category is null;
update topic_taxonomy set category = 'tactical' where slug = 'flank' and category is null;

update private_lessons l
   set topics = (
     select jsonb_agg(
       case when t->>'topic_slug' in ('distane-parry-repost','distance-parry')
            then jsonb_set(t, '{topic_slug}', '"distance-parry-riposte"')
            else t end)
     from jsonb_array_elements(l.topics) t)
 where l.topics @> '[{"topic_slug":"distane-parry-repost"}]'
    or l.topics @> '[{"topic_slug":"distance-parry"}]';

create or replace view fencer_rating_calibration as
select p.id as profile_id, p.name, p.role,
       count(*) as ratings_given,
       round(avg((t->>'mastery_1_10')::numeric), 2) as mean_self_rating,
       round(stddev_pop((t->>'mastery_1_10')::numeric), 2) as spread,
       min((t->>'mastery_1_10')::int) as lowest,
       max((t->>'mastery_1_10')::int) as highest
from profiles p
join private_lessons l on l.profile_id = p.id and l.deleted_at is null
cross join lateral jsonb_array_elements(l.topics) t
where t ? 'mastery_1_10'
group by p.id, p.name, p.role;

comment on view fencer_rating_calibration is
'Each fencer''s own rating baseline. A 6 from someone who averages 5.7 means something different from a 6 from someone who averages 8.2 - coaching must compare a fencer to themselves.';
