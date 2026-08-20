alter table profiles add column if not exists club text;

comment on column profiles.club is
'Home club, as it appears on fencingtracker.';

-- Corrected from fencingtracker rather than memory:
-- Raedyn earned B26 on 2026-05-06 (D25 -> D26 -> B26 over 2026).
-- Kaylan has no personal foil rating yet; the letters beside his results are
-- event rating classifications, not his own.
update profiles
   set rating = 'B26',
       club   = 'SoCAL Fencing Center'
 where role = 'raedyn';

update profiles
   set rating = 'U',
       club   = 'SoCAL Fencing Center',
       birth_year = 2014
 where role = 'kaylan';
