-- Seed from strength, not from the letter.
--
-- The first pass at competition goals estimated seeds by counting rating
-- letters in the field. That was wrong in both directions: it put Raedyn 14th
-- in a Cadet event he actually seeds 38th, and Kaylan 55th in a Y14 event he
-- actually seeds 15th.
--
-- The letter is a badge and it lags. Raedyn is B26 and Kaylan is unrated, yet
-- their published strength ratings are 1887 and 1828 - 59 points apart. A
-- letter is earned in a single qualifying result; strength accumulates from
-- every bout. fencingtracker publishes the number and the per-event entrant
-- rank, so there is no reason to infer either.

alter table profiles add column if not exists strength_rating int;

comment on column profiles.strength_rating is
'fencingtracker strength number. Seeds off this, NOT the USFA letter - an unrated fencer with results can outrank a lettered one.';

update profiles set strength_rating = 1887 where role = 'raedyn';
update profiles set strength_rating = 1828 where role = 'kaylan';
