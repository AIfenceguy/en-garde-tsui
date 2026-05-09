-- AI coaching context tables
-- =====================================
-- Three tables to support the Claude-powered coaching layer:
--   coach_notes      = every Claude response is logged for audit + reuse
--   training_plans   = the 8-week macrocycle + weekly + daily plans
--   profile_context  = long-term priors (interview, FT analysis, style profiles, coaching philosophy)

-- =====================================
-- coach_notes
-- =====================================
create table if not exists coach_notes (
    id              uuid primary key default gen_random_uuid(),
    profile_id      uuid not null references profiles(id) on delete cascade,
    bout_id         uuid references bouts(id) on delete set null,
    opponent_id     uuid references opponents(id) on delete set null,
    kind            text not null,
    input_summary   jsonb,
    model           text,
    response_text   text,
    response_json   jsonb,
    created_at      timestamptz not null default now()
);
create index if not exists coach_notes_profile_kind_idx on coach_notes (profile_id, kind, created_at desc);
create index if not exists coach_notes_bout_idx on coach_notes (bout_id) where bout_id is not null;
create index if not exists coach_notes_opponent_idx on coach_notes (opponent_id) where opponent_id is not null;

alter table coach_notes enable row level security;

drop policy if exists "coach_notes - read own" on coach_notes;
create policy "coach_notes - read own" on coach_notes
    for select using (profile_belongs_to_me(profile_id));
drop policy if exists "coach_notes - insert own" on coach_notes;
create policy "coach_notes - insert own" on coach_notes
    for insert with check (profile_belongs_to_me(profile_id));
drop policy if exists "coach_notes - delete own" on coach_notes;
create policy "coach_notes - delete own" on coach_notes
    for delete using (profile_belongs_to_me(profile_id));

comment on table coach_notes is
'Every Claude AI coaching response. Used for audit, history, and feeding back into future prompts as context.';

-- =====================================
-- training_plans
-- =====================================
create table if not exists training_plans (
    id              uuid primary key default gen_random_uuid(),
    profile_id      uuid not null references profiles(id) on delete cascade,
    plan_kind       text not null,
    period_start    date,
    period_end      date,
    title           text,
    content         jsonb,
    source          text default 'ai',
    is_active       boolean not null default true,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now()
);
create index if not exists training_plans_profile_active_idx
    on training_plans (profile_id, is_active, period_start desc) where is_active;

alter table training_plans enable row level security;

drop policy if exists "training_plans - read own" on training_plans;
create policy "training_plans - read own" on training_plans
    for select using (profile_belongs_to_me(profile_id));
drop policy if exists "training_plans - insert own" on training_plans;
create policy "training_plans - insert own" on training_plans
    for insert with check (profile_belongs_to_me(profile_id));
drop policy if exists "training_plans - update own" on training_plans;
create policy "training_plans - update own" on training_plans
    for update using (profile_belongs_to_me(profile_id));
drop policy if exists "training_plans - delete own" on training_plans;
create policy "training_plans - delete own" on training_plans
    for delete using (profile_belongs_to_me(profile_id));

comment on table training_plans is
'Periodized training plans. AI-generated 8-week macrocycle + weekly breakdowns. Editable.';

-- =====================================
-- profile_context — long-term priors per profile
-- =====================================
create table if not exists profile_context (
    id              uuid primary key default gen_random_uuid(),
    profile_id      uuid not null references profiles(id) on delete cascade,
    kind            text not null,
    content         jsonb not null,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (profile_id, kind)
);
create index if not exists profile_context_profile_idx on profile_context (profile_id);

alter table profile_context enable row level security;

drop policy if exists "profile_context - read own" on profile_context;
create policy "profile_context - read own" on profile_context
    for select using (profile_belongs_to_me(profile_id));
drop policy if exists "profile_context - upsert own" on profile_context;
create policy "profile_context - upsert own" on profile_context
    for insert with check (profile_belongs_to_me(profile_id));
drop policy if exists "profile_context - update own" on profile_context;
create policy "profile_context - update own" on profile_context
    for update using (profile_belongs_to_me(profile_id));
drop policy if exists "profile_context - delete own" on profile_context;
create policy "profile_context - delete own" on profile_context
    for delete using (profile_belongs_to_me(profile_id));

comment on table profile_context is
'Long-term context priors per profile: interview answers, FT analysis, style philosophy, goals. Fed into every Claude prompt.';

-- =====================================
-- Touch updated_at automatically
-- =====================================
create or replace function tg_touch_updated_at() returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end$$;

drop trigger if exists training_plans_touch on training_plans;
create trigger training_plans_touch before update on training_plans
    for each row execute function tg_touch_updated_at();

drop trigger if exists profile_context_touch on profile_context;
create trigger profile_context_touch before update on profile_context
    for each row execute function tg_touch_updated_at();
