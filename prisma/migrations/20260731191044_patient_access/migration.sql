-- CreateTable
CREATE TABLE "PatientAccess" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'google',
    "providerUserId" TEXT NOT NULL,
    "email" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "boundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "boundVia" TEXT NOT NULL DEFAULT 'plan_link',
    "confirmedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "PatientAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PatientAccess_patientId_status_idx" ON "PatientAccess"("patientId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PatientAccess_provider_providerUserId_patientId_key" ON "PatientAccess"("provider", "providerUserId", "patientId");

-- AddForeignKey
ALTER TABLE "PatientAccess" ADD CONSTRAINT "PatientAccess_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- medSpace: this is the one table where RLS is load-bearing, not just posture.
-- PatientAccess maps a Google account -> patient records; Prisma creates tables
-- with RLS OFF and this project grants anon/authenticated ALL on new public
-- tables, so without the two statements below anyone holding the (public)
-- publishable key could POST /rest/v1/PatientAccess and bind their own Google
-- account to any patient with no OAuth and no link. Guarded so the identical
-- file also runs on local Docker Postgres, which has no anon role.
ALTER TABLE "PatientAccess" ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "PatientAccess" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "PatientAccess" FROM authenticated;
  END IF;
END $$;
