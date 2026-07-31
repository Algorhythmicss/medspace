-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "linkVersion" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_key_failedAt_idx" ON "LoginAttempt"("key", "failedAt");

-- medSpace: PostgREST access is RLS deny-all (AGENTS.md § Databases). Prisma
-- creates tables with RLS OFF, and this project's default privileges grant
-- anon/authenticated ALL on new public tables, so a new table is world-readable
-- through the publishable key until both statements below run. LoginAttempt
-- holds hashed IPs; deny outright, like every other table.
ALTER TABLE "LoginAttempt" ENABLE ROW LEVEL SECURITY;
-- Guarded so the identical file runs on local Docker Postgres (no anon role)
-- and on Supabase (where the REVOKE is the load-bearing part).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "LoginAttempt" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "LoginAttempt" FROM authenticated;
  END IF;
END $$;
