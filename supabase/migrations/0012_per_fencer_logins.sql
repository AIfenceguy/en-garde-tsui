-- Per-fencer logins.
--
-- Until now the family shared one account and picked a profile from a
-- switcher, so either boy could open the other's journal. Each fencer now has
-- their own login and sees only their own profile.
--
-- owner_user_id stays as the family owner (Ricky) so the parent account keeps
-- oversight of both boys; login_user_id is the fencer's own auth user. Access
-- is granted when EITHER matches, which is what preserves parent visibility
-- while narrowing each kid to themselves.

alter table profiles add column if not exists login_user_id uuid references auth.users(id) on delete set null;

create unique index if not exists profiles_login_user_idx
    on profiles (login_user_id) where login_user_id is not null;

comment on column profiles.login_user_id is
'The fencer''s own auth user. Parent access still flows through owner_user_id, so both routes are checked in RLS.';

-- Link the two boys to the accounts just provisioned.
update profiles set login_user_id = 'a1763d9a-8dfa-492d-8efc-35b4c5552199' where role = 'raedyn';
update profiles set login_user_id = '22482a4f-b4e7-4aac-9fa3-c47f6993c878' where role = 'kaylan';

-- ============================================================
-- profiles RLS: own profile, or any profile you are the family owner of
-- ============================================================
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
    for select using (owner_user_id = auth.uid() or login_user_id = auth.uid());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
    for update using (owner_user_id = auth.uid() or login_user_id = auth.uid())
    with check (owner_user_id = auth.uid() or login_user_id = auth.uid());

-- ============================================================
-- Every data table routes through this helper, so widening it here is what
-- lets a boy read and write his own bouts, lessons, videos and check-ins.
-- ============================================================
create or replace function profile_belongs_to_me(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select exists (
        select 1 from profiles
        where id = p_profile_id
          and (owner_user_id = auth.uid() or login_user_id = auth.uid())
    );
$$;
