-- Each fencer's style model - the elite fencer they are trying to fence like.
--
-- Raedyn -> Ryan Choi (Choi Chun-yin, HKG). 2025 world champion and world No 1,
-- known for an unorthodox leap-crouch-charge game.
-- Kaylan -> Alexander Massialas (USA). Rio 2016 individual silver, FIE Hall of
-- Fame, now Stanford head coach; a classical, controlled distance game.
--
-- Stored on the profile so the Video study section can point each boy at the
-- right footage, and so future coaching can compare what they log against the
-- fencer they are modelling.

alter table profiles add column if not exists style_model      text;
alter table profiles add column if not exists style_model_note text;

comment on column profiles.style_model is
'Elite fencer this profile is modelling their game on. Drives video study suggestions.';

update profiles
   set style_model = 'Ryan Choi',
       style_model_note = 'Hong Kong, foil. 2025 world champion and world No 1. Unorthodox leap-crouch-charge style, explosive off the back leg.'
 where role = 'raedyn' and style_model is null;

update profiles
   set style_model = 'Alexander Massialas',
       style_model_note = 'USA, foil. Rio 2016 individual silver, FIE Hall of Fame. Classical game built on distance control and patient preparation.'
 where role = 'kaylan' and style_model is null;
