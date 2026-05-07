-- Row Level Security: a Supabase user can read/write rows they own,
-- where ownership is established via the profiles table.
-- The single-family-account model means one auth.users row owns all profiles
-- in the family; the per-kid privacy boundary lives at the UI layer.

alter table profiles            enable row level security;
alter table opponents           enable row level security;
alter table opponent_swots      enable row level security;
alter table opponent_5w2h       enable row level security;
alter table bouts               enable row level security;
alter table physical_sessions   enable row level security;
alter table mental_sessions     enable row level security;
alter table private_lessons     enable row level security;
alter table group_lessons       enable row level security;
alter table tournaments         enable row level security;
alter table topic_taxonomy      enable row level security;
alter table drill_taxonomy      enable row level security;
alter table tactic_taxonomy     enable row level security;

-- ============================================================
-- profiles: user can CRUD their own profile rows
-- ============================================================
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
    for select using (owner_user_id = auth.uid());

drop policy if exists profiles_insert on profiles;
create policy profiles_insert on profiles
    for insert with check (owner_user_id = auth.uid());

drop policy if exists profiles_update on profiles;
create policy profiles_update on profiles
    for update using (owner_user_id = auth.uid())
    with check (owner_user_id = auth.uid());

drop policy if exists profiles_delete on profiles;
create policy profiles_delete on profiles
    for delete using (owner_user_id = auth.uid());

-- ============================================================
-- helper: rows are accessible if their profile_id maps to a profile
-- the current auth.uid() owns
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
        where id = p_profile_id and owner_user_id = auth.uid()
    );
$$;

-- ============================================================
-- generic CRUD policies on profile_id-keyed tables
-- ============================================================
do $$
declare
    t text;
    tables text[] := array[
        'opponents','opponent_swots','opponent_5w2h',
        'bouts','physical_sessions','mental_sessions',
        'private_lessons','group_lessons','tournaments'
    ];
begin
    foreach t in array tables
    loop
        execute format('drop policy if exists %I_select on %I', t, t);
        execute format(
            'create policy %I_select on %I for select using (profile_belongs_to_me(profile_id))',
            t, t
        );

        execute format('drop policy if exists %I_insert on %I', t, t);
        execute format(
            'create policy %I_insert on %I for insert with check (profile_belongs_to_me(profile_id))',
            t, t
        );

        execute format('drop policy if exists %I_update on %I', t, t);
        execute format(
            'create policy %I_update on %I for update using (profile_belongs_to_me(profile_id)) with check (profile_belongs_to_me(profile_id))',
            t, t
        );

        execute format('drop policy if exists %I_delete on %I', t, t);
        execute format(
            'create policy %I_delete on %I for delete using (profile_belongs_to_me(profile_id))',
            t, t
        );
    end loop;
end$$;

-- ============================================================
-- taxonomies: globally readable to authenticated users; insert/update only
-- if you authored the row (so seeded rows stay immutable for end users).
-- ============================================================
drop policy if exists topic_taxonomy_select on topic_taxonomy;
create policy topic_taxonomy_select on topic_taxonomy
    for select to authenticated using (true);

drop policy if exists topic_taxonomy_insert on topic_taxonomy;
create policy topic_taxonomy_insert on topic_taxonomy
    for insert to authenticated
    with check (created_by is null or profile_belongs_to_me(created_by));

drop policy if exists drill_taxonomy_select on drill_taxonomy;
create policy drill_taxonomy_select on drill_taxonomy
    for select to authenticated using (true);

drop policy if exists drill_taxonomy_insert on drill_taxonomy;
create policy drill_taxonomy_insert on drill_taxonomy
    for insert to authenticated
    with check (created_by is null or profile_belongs_to_me(created_by));

drop policy if exists tactic_taxonomy_select on tactic_taxonomy;
create policy tactic_taxonomy_select on tactic_taxonomy
    for select to authenticated using (true);

drop policy if exists tactic_taxonomy_insert on tactic_taxonomy;
create policy tactic_taxonomy_insert on tactic_taxonomy
    for insert to authenticated
    with check (created_by is null or profile_belongs_to_me(created_by));
