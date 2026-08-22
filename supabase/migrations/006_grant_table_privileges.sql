-- ============================================================
-- Local environment parity — API-role table grants.
--
-- THIS IS A LOCAL-ONLY SHIM. It is not a migration and does not change the
-- product schema. Applied automatically by `supabase db reset` and by a fresh
-- `supabase start` (which is what CI does).
--
-- Why it is needed
-- ----------------
-- On this local stack, ALTER DEFAULT PRIVILEGES for tables created by the
-- `postgres` role in schema `public` grants only Dxtm (TRUNCATE, REFERENCES,
-- TRIGGER, MAINTAIN) to anon/authenticated/service_role — no SELECT, INSERT,
-- UPDATE or DELETE. Verify with:
--
--   select defaclacl from pg_default_acl
--    where pg_get_userbyid(defaclrole) = 'postgres'
--      and defaclnamespace::regnamespace::text = 'public'
--      and defaclobjtype = 'r';
--
-- Migrations run as `postgres` and 001_initial_schema.sql issues no explicit
-- GRANT, so all five tables end up unreachable by every PostgREST role. The
-- app itself cannot read its own data locally, and service_role cannot seed.
-- Supabase Cloud's default privileges do include the DML grants, which is why
-- this never surfaced against the cloud project.
--
-- RLS is unaffected. Grants are the coarse "may this role touch the table at
-- all" layer; the per-user policies in 001_initial_schema.sql still decide
-- which rows each user sees. service_role bypasses RLS by design, which is
-- exactly what the E2E seed helpers rely on.
--
-- If the same gap is ever observed on Cloud, the fix belongs in a numbered
-- migration instead of here — that is a schema decision, not an environment one.
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO anon, authenticated, service_role;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO anon, authenticated, service_role;

-- Keep future tables working without another manual step.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES
  TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES
  TO anon, authenticated, service_role;
