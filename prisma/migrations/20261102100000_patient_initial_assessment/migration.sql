BEGIN;

CREATE TABLE "InitialAssessment" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "submissionKey" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "questionVersion" INTEGER NOT NULL DEFAULT 1 CHECK ("questionVersion" = 1),
  "concern" TEXT NOT NULL CHECK (char_length("concern") BETWEEN 1 AND 2000),
  "duration" TEXT NOT NULL CHECK (char_length("duration") BETWEEN 1 AND 2000),
  "context" TEXT NOT NULL CHECK (char_length("context") BETWEEN 1 AND 2000),
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'reviewed', 'dismissed')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  CONSTRAINT "InitialAssessment_review_check" CHECK (("status" = 'pending') = ("reviewedAt" IS NULL))
);

CREATE UNIQUE INDEX "InitialAssessment_patientId_submissionKey_key" ON "InitialAssessment"("patientId", "submissionKey");
CREATE INDEX "InitialAssessment_patientId_createdAt_idx" ON "InitialAssessment"("patientId", "createdAt");

CREATE TABLE "AssessmentFile" (
  "id" TEXT PRIMARY KEY,
  "assessmentId" TEXT NOT NULL REFERENCES "InitialAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name" TEXT NOT NULL CHECK (char_length("name") BETWEEN 1 AND 140),
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 2097152),
  "sha256" TEXT NOT NULL CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  "data" BYTEA NOT NULL,
  "scanStatus" TEXT NOT NULL DEFAULT 'quarantined' CHECK ("scanStatus" IN ('rewritten', 'clean', 'quarantined', 'rejected')),
  "scannedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssessmentFile_data_size_check" CHECK (octet_length("data") = "size"),
  CONSTRAINT "AssessmentFile_scan_check" CHECK (("scanStatus" IN ('quarantined', 'rewritten')) OR "scannedAt" IS NOT NULL)
);
CREATE INDEX "AssessmentFile_assessmentId_idx" ON "AssessmentFile"("assessmentId");

CREATE TABLE "AssessmentUploadLimit" (
  "patientId" TEXT PRIMARY KEY REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "attempts" INTEGER NOT NULL DEFAULT 1 CHECK ("attempts" > 0)
);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['InitialAssessment', 'AssessmentFile', 'AssessmentUploadLimit']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', table_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', table_name);
    END IF;
  END LOOP;
END $$;

COMMIT;
