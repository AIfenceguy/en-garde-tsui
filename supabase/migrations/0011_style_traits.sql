-- Style-model progress tracking.
--
-- "Copy Ryan Choi" is not trainable on its own. This breaks each model's game
-- into a handful of concrete, observable traits the fencer can rate themselves
-- on, then records those ratings over time so progress is visible rather than
-- vibes.
--
-- style_traits is the shared catalog (which traits belong to which model);
-- style_checkins is one fencer's rating of one trait on one day.

create table if not exists style_traits (
    id           uuid primary key default gen_random_uuid(),
    -- matches profiles.style_model
    model_name   text not null,
    slug         text not null,
    label        text not null,
    -- what it actually looks like on the piste, in kid-readable language
    description  text,
    -- how to practise it
    how_to_train text,
    sort_order   int not null default 0,
    created_at   timestamptz not null default now(),
    unique (model_name, slug)
);

create index if not exists style_traits_model_idx on style_traits (model_name, sort_order);

alter table style_traits enable row level security;

drop policy if exists style_traits_select on style_traits;
create policy style_traits_select on style_traits
    for select to authenticated using (true);

drop policy if exists style_traits_insert on style_traits;
create policy style_traits_insert on style_traits
    for insert to authenticated with check (true);

-- ============================================================
-- style_checkins - the progress record
-- ============================================================
create table if not exists style_checkins (
    id           uuid primary key default gen_random_uuid(),
    profile_id   uuid not null references profiles(id) on delete cascade,
    trait_slug   text not null,
    model_name   text not null,
    -- 1 = not like them at all, 10 = that is exactly their game
    rating_1_10  int not null check (rating_1_10 between 1 and 10),
    note         text,
    checked_at   date not null default (now() at time zone 'utc')::date,
    created_at   timestamptz not null default now()
);

create index if not exists style_checkins_profile_idx
    on style_checkins (profile_id, trait_slug, created_at desc);

alter table style_checkins enable row level security;

drop policy if exists style_checkins_select on style_checkins;
create policy style_checkins_select on style_checkins
    for select using (profile_belongs_to_me(profile_id));

drop policy if exists style_checkins_insert on style_checkins;
create policy style_checkins_insert on style_checkins
    for insert with check (profile_belongs_to_me(profile_id));

drop policy if exists style_checkins_update on style_checkins;
create policy style_checkins_update on style_checkins
    for update using (profile_belongs_to_me(profile_id))
    with check (profile_belongs_to_me(profile_id));

-- ============================================================
-- Ryan Choi - Raedyn's model
-- Explosive, unorthodox, changes level and rhythm to break patterns.
-- ============================================================
insert into style_traits (model_name, slug, label, description, how_to_train, sort_order) values
    ('Ryan Choi', 'explosive-drive', 'Explosive back-leg drive',
     'He covers ground other fencers cannot, so he can attack from a distance that feels safe to you.',
     'Broad jumps, depth jumps and single-leg bounds. Then lunge from one step further out than feels comfortable.', 1),
    ('Ryan Choi', 'change-of-level', 'Change of level',
     'He drops into a crouch mid-action, so your parry searches where his blade used to be.',
     'Shadow footwork: advance high, finish low. Ten reps, then the same into a partner drill.', 2),
    ('Ryan Choi', 'broken-rhythm', 'Broken rhythm',
     'He speeds up and stalls inside one action, so opponents commit early.',
     'Pair drill: advance-advance-PAUSE-lunge. Change where the pause lands every rep.', 3),
    ('Ryan Choi', 'charging-pressure', 'Charging pressure',
     'He closes distance hard and makes you fence at his tempo, not yours.',
     'Bouts starting at 4-4 where you must take the first step forward every single touch.', 4),
    ('Ryan Choi', 'unorthodox-angles', 'Unorthodox angles',
     'He finishes from angles a textbook fencer would not try, which beats a clean parry.',
     'Target work: hit the same target from high, low and around the guard.', 5),
    ('Ryan Choi', 'refuse-to-fold', 'Refuses to fold',
     'He nearly quit after a bad season start, then became world champion. He does not stop competing when behind.',
     'Down 2-4 scenarios. Log what you actually changed, not just whether you won.', 6)
on conflict (model_name, slug) do nothing;

-- ============================================================
-- Alexander Massialas - Kaylan's model
-- Classical, patient, wins the distance battle before the blade one.
-- ============================================================
insert into style_traits (model_name, slug, label, description, how_to_train, sort_order) values
    ('Alexander Massialas', 'distance-control', 'Distance control',
     'He is never in range unless he chose to be. Opponents attack and land short.',
     'No-touch distance game: five minutes keeping exact lunge distance while your partner moves.', 1),
    ('Alexander Massialas', 'patient-prep', 'Patient preparation',
     'He does not rush. He prepares until the opening is real, not hoped for.',
     'Bout rule: no attack until you have made three preparation actions.', 2),
    ('Alexander Massialas', 'second-intention', 'Second intention',
     'He offers an attack he expects you to parry, then hits the line you opened.',
     'Feint-draw-parry-riposte pairs. Deliberately let the first action fail.', 3),
    ('Alexander Massialas', 'point-precision', 'Point precision',
     'His point arrives exactly where he aimed, so tight lines still score.',
     'Point control drill: small target, slow and exact beats fast and loose.', 4),
    ('Alexander Massialas', 'attack-in-prep', 'Attack in preparation',
     'He hits you while you are still getting ready, before your action exists.',
     'Partner steps forward, you lunge mid-step. Twenty reps, four sets.', 5),
    ('Alexander Massialas', 'composure', 'Composure at 14-14',
     'Four Olympic Games and an individual silver. The score does not change how he fences.',
     'Practise only 14-14 touches. One point, full pressure, then reset.', 6)
on conflict (model_name, slug) do nothing;

grant all on style_traits   to anon, authenticated, service_role;
grant all on style_checkins to anon, authenticated, service_role;
revoke delete on style_checkins from anon, authenticated;
