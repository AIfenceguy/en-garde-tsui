-- Restore the standard Supabase role grants.
--
-- Dropping and recreating every table in `public` (during the 2026-08 rebuild)
-- lost the grants Supabase normally provisions, leaving anon/authenticated/
-- service_role with only REFERENCES/TRIGGER/TRUNCATE. PostgREST then returned
-- 42501 "permission denied" for every table, so the app could neither read nor
-- write anything.
--
-- Row Level Security remains the actual access boundary; these grants are the
-- coarse layer that RLS sits on top of. Without both, the app is broken.
--
-- IMPORTANT for anyone rebuilding this database from scratch: run this after
-- the schema migrations, or nothing will work.

grant usage on schema public to anon, authenticated, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all functions in schema public to anon, authenticated, service_role;

-- Ensure tables created later inherit the same grants.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
