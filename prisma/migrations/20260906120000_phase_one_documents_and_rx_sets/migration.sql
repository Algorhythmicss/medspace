-- Phase 1 clinic workflow completion: doctor-owned saved prescription sets and
-- immutable chart-linked medical letters/certificates.
CREATE TABLE "PrescriptionSet" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "advice" TEXT,
  "followUpInDays" INTEGER,
  "labTasks" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PrescriptionSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PrescriptionSetItem" (
  "id" TEXT NOT NULL,
  "prescriptionSetId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "drugName" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "duration" TEXT,
  "instructions" TEXT,
  CONSTRAINT "PrescriptionSetItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MedicalDocument" (
  "id" TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "visitId" TEXT,
  "kind" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "recipient" TEXT,
  "validFrom" TIMESTAMP(3),
  "validUntil" TIMESTAMP(3),
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicalDocument_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PrescriptionSet_nameKey_key" ON "PrescriptionSet"("nameKey");
CREATE INDEX "PrescriptionSetItem_prescriptionSetId_sortOrder_idx" ON "PrescriptionSetItem"("prescriptionSetId", "sortOrder");
CREATE INDEX "MedicalDocument_patientId_issuedAt_idx" ON "MedicalDocument"("patientId", "issuedAt");
CREATE INDEX "MedicalDocument_visitId_idx" ON "MedicalDocument"("visitId");

ALTER TABLE "PrescriptionSetItem"
ADD CONSTRAINT "PrescriptionSetItem_prescriptionSetId_fkey"
FOREIGN KEY ("prescriptionSetId") REFERENCES "PrescriptionSet"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicalDocument"
ADD CONSTRAINT "MedicalDocument_patientId_fkey"
FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MedicalDocument"
ADD CONSTRAINT "MedicalDocument_visitId_fkey"
FOREIGN KEY ("visitId") REFERENCES "Visit"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma connects as the owner and bypasses RLS. Supabase's public API roles
-- must never receive direct table access to clinical data.
DO $$
DECLARE
  t text;
  has_anon boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon');
  has_auth boolean := EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
BEGIN
  FOREACH t IN ARRAY ARRAY['PrescriptionSet', 'PrescriptionSetItem', 'MedicalDocument']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    IF has_anon THEN EXECUTE format('REVOKE ALL ON %I FROM anon;', t); END IF;
    IF has_auth THEN EXECUTE format('REVOKE ALL ON %I FROM authenticated;', t); END IF;
  END LOOP;
END $$;
