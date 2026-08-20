-- fencingtracker profile links, so results and rating history can be
-- cross-referenced against what the boys log themselves.
alter table profiles add column if not exists tracker_url text;
alter table profiles add column if not exists tracker_id  text;

comment on column profiles.tracker_url is
'fencingtracker.com profile URL. The opponents table already carries one of these; this is the fencer''s own.';

update profiles
   set tracker_url = 'https://fencingtracker.com/p/100280844/Raedyn%20Ho%20Hin-Tsui',
       tracker_id  = '100280844'
 where role = 'raedyn';

update profiles
   set tracker_url = 'https://fencingtracker.com/p/100280845/Kaylan%20Ho%20Sen-Tsui',
       tracker_id  = '100280845'
 where role = 'kaylan';
