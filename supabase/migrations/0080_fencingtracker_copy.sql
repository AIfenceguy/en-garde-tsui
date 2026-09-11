-- The one-time FencingTracker copy (Ricky's go, 2026-09-11): foil, Youth 8
-- through Junior, men's and women's, one full season and this one. Raw copies
-- of what their pages show, keyed the way they key it: the profile id, which
-- is the USA Fencing member number. Written only by the copier (service key);
-- members may read. Applied 2026-09-11.

create table if not exists ft_tournaments (
  ft_tid integer primary key,
  name text,
  venue text,
  city text,
  start_date date,
  end_date date,
  events integer,
  read_at timestamptz
);

create table if not exists ft_events (
  ft_event_id integer primary key,
  ft_tid integer,
  title text,
  code text,                -- Y14MF, CDTWF, JNRMF ...
  category text,            -- Y8 Y10 Y12 Y14 CDT JNR DV1 D1A DV2 DV3 SNR VET ...
  gender text,              -- M W X
  weapon text,              -- F E S
  event_date date,
  start_at timestamp,
  tournament text,
  venue text,
  city text,
  entrants integer,
  entrants_read_at timestamptz,
  results_rows integer,
  results_read_at timestamptz
);
create index if not exists ft_events_date on ft_events (event_date);
create index if not exists ft_events_kind on ft_events (weapon, gender, category, event_date);

create table if not exists ft_fencers (
  tracker_id bigint primary key,      -- the USA Fencing member number
  name text,
  country text,
  birth_year integer,
  club text,
  rating text,
  strength_de integer,
  strength_est numeric,
  verified boolean,
  last_seen date,
  profile_read_at timestamptz
);

create table if not exists ft_entries (
  ft_event_id integer not null,
  tracker_id bigint not null,
  list_pos integer,
  name text,
  club text,
  rating text,
  strength_de integer,
  strength_est numeric,
  read_at timestamptz not null default now(),
  primary key (ft_event_id, tracker_id)
);
create index if not exists ft_entries_fencer on ft_entries (tracker_id);

create table if not exists ft_results (
  ft_event_id integer not null,
  name text not null,
  tracker_id bigint,
  place integer,
  extra jsonb,
  primary key (ft_event_id, name)
);
create index if not exists ft_results_fencer on ft_results (tracker_id);

create table if not exists ft_bouts (
  ft_event_id integer not null,
  name text not null,
  tracker_id bigint,
  phase text not null,                -- pool | de
  bout_no integer not null,
  opponent text,
  opponent_tracker_id bigint,
  result text,                        -- V | D
  score_for integer,
  score_against integer,
  difficulty text,
  primary key (ft_event_id, name, phase, bout_no)
);
create index if not exists ft_bouts_fencer on ft_bouts (tracker_id);
create index if not exists ft_bouts_opponent on ft_bouts (opponent_tracker_id);

do $$
declare t text;
begin
  foreach t in array array['ft_tournaments','ft_events','ft_fencers','ft_entries','ft_results','ft_bouts'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon', t);
    execute format('grant select on %I to authenticated', t);
    execute format('drop policy if exists %I on %I', t || '_read', t);
    execute format('create policy %I on %I for select to authenticated using (true)', t || '_read', t);
    execute format('drop policy if exists member_gate on %I', t);
    execute format('create policy member_gate on %I as restrictive for all to authenticated using (is_member()) with check (is_member())', t);
  end loop;
end $$;
