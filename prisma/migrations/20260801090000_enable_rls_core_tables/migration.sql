-- Retrofit: the init migration created the 11 core tables WITHOUT row-level
-- security. On production these were locked down out-of-band (a Supabase-side
-- `enable_rls_deny_all` step), but the checked-in Prisma migrations did not
-- reproduce it — so a fresh `prisma migrate deploy` to an empty database (new
-- region, staging, DR restore) would leave real patient records readable and
-- writable through the public publishable key. This migration makes deny-all an
-- invariant the migration history actually guarantees, matching the two later
-- tables (LoginAttempt, PatientAccess) that already carry it.
--
-- Idempotent: ENABLE on an already-enabled table is a no-op, and the REVOKE is
-- guarded so it runs on Supabase (where anon/authenticated exist) and is skipped
-- on local Docker Postgres (which has neither role).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'Clinic','Patient','Condition','Allergy','Visit','Prescription',
    'PrescriptionItem','Observation','Report','CarePlanTask','Drug'
  ];
  has_anon boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_auth boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    IF has_anon THEN EXECUTE format('REVOKE ALL ON %I FROM anon;', t); END IF;
    IF has_auth THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated;', t); END IF;
  END LOOP;
END $$;
