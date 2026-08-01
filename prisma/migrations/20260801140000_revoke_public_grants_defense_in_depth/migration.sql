-- Make deny-all a schema-wide invariant: RLS on + no anon/authenticated grants
-- on EVERY public table, enforced in one idempotent place rather than relying on
-- each table's own migration to remember both halves.
--
-- Why both halves matter: patient records are protected by RLS deny-all (RLS
-- enabled, zero policies), and the app never touches these tables through
-- PostgREST — it reads with Prisma as the postgres owner, which bypasses RLS.
-- But Supabase grants anon/authenticated ALL privileges on public tables by
-- default, so with ONLY RLS the entire protection rests on RLS staying deny-all:
-- one table created without RLS, or one stray permissive policy, and the public
-- publishable key reaches health data through the REST endpoint. Revoking the
-- grants is the belt to that suspenders.
--
-- On production the 11 core tables had RLS enabled out-of-band but never had
-- their grants revoked, and QueueEntry's own migration enabled RLS out-of-band
-- too without reproducing it in history. This migration closes both gaps for
-- every current table and, via ALTER DEFAULT PRIVILEGES, stops any FUTURE table
-- from silently re-arming the two roles.
--
-- Fully idempotent (ENABLE on an already-enabled table and REVOKE of an
-- already-absent grant are both no-ops) and guarded so the identical file is
-- harmless on local Docker Postgres, which has neither the anon nor the
-- authenticated role.
DO $$
DECLARE
  t text;
  has_anon boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_auth boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOR t IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    IF has_anon THEN EXECUTE format('REVOKE ALL ON %I FROM anon;', t); END IF;
    IF has_auth THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated;', t); END IF;
  END LOOP;

  IF has_anon THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  END IF;
  IF has_auth THEN
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
  END IF;
END $$;
