BEGIN;

ALTER TABLE "QueueEntry"
  ADD COLUMN "dayKey" TEXT,
  ADD COLUMN "number" INTEGER CHECK ("number" > 0),
  ADD COLUMN "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "calledAt" TIMESTAMP(3),
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0);
CREATE INDEX "QueueEntry_dayKey_status_queuedAt_idx" ON "QueueEntry"("dayKey", "status", "queuedAt");
CREATE UNIQUE INDEX "QueueEntry_live_number_unique" ON "QueueEntry"("dayKey", "number") WHERE "dayKey" IS NOT NULL AND "number" IS NOT NULL;
CREATE UNIQUE INDEX "QueueEntry_live_patient_unique" ON "QueueEntry"("patientId", "dayKey") WHERE "dayKey" IS NOT NULL AND "status" IN ('waiting', 'called', 'in_consultation');
CREATE UNIQUE INDEX "QueueEntry_one_doctor_slot" ON "QueueEntry"((1)) WHERE "status" IN ('called', 'in_consultation');

CREATE TABLE "ClinicLiveSettings" (
  "id" TEXT PRIMARY KEY DEFAULT 'clinic' REFERENCES "Clinic"("id") ON DELETE CASCADE,
  "averageMinutes" INTEGER CHECK ("averageMinutes" BETWEEN 1 AND 240),
  "paused" BOOLEAN NOT NULL DEFAULT false,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "ClinicQueueDay" (
  "dayKey" TEXT PRIMARY KEY CHECK ("dayKey" ~ '^\d{4}-\d{2}-\d{2}$'),
  "nextNumber" INTEGER NOT NULL DEFAULT 1 CHECK ("nextNumber" > 0)
);
CREATE TABLE "LiveCommandReceipt" (
  "id" TEXT PRIMARY KEY,
  "actor" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "payloadHash" TEXT NOT NULL CHECK (char_length("payloadHash") = 64),
  "result" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "LiveCommandReceipt_createdAt_idx" ON "LiveCommandReceipt"("createdAt");
CREATE TABLE "ProgressPhotoRequest" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE,
  "taskId" TEXT UNIQUE REFERENCES "CarePlanTask"("id") ON DELETE SET NULL,
  "instructions" TEXT NOT NULL CHECK (char_length("instructions") BETWEEN 1 AND 500),
  "maximumPhotos" INTEGER NOT NULL DEFAULT 3 CHECK ("maximumPhotos" BETWEEN 1 AND 3),
  "status" TEXT NOT NULL DEFAULT 'open' CHECK ("status" IN ('open', 'closed')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMP(3),
  CHECK (("status" = 'open') = ("closedAt" IS NULL))
);
CREATE INDEX "ProgressPhotoRequest_patientId_status_idx" ON "ProgressPhotoRequest"("patientId", "status");
CREATE TABLE "CareMedia" (
  "id" TEXT PRIMARY KEY,
  "patientId" TEXT NOT NULL REFERENCES "Patient"("id") ON DELETE CASCADE,
  "requestId" TEXT REFERENCES "ProgressPhotoRequest"("id") ON DELETE CASCADE,
  "queueEntryId" TEXT REFERENCES "QueueEntry"("id") ON DELETE SET NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('progress_photo', 'doctor_audio')),
  "name" TEXT NOT NULL CHECK (char_length("name") BETWEEN 1 AND 140),
  "mime" TEXT NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 2097152),
  "sha256" TEXT NOT NULL CHECK (char_length("sha256")=64),
  "data" BYTEA NOT NULL,
  "durationMs" INTEGER,
  "sharedAt" TIMESTAMP(3),
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("size" = octet_length("data")),
  CHECK (("kind"='progress_photo' AND "requestId" IS NOT NULL AND "mime"='image/webp' AND "durationMs" IS NULL AND "sharedAt" IS NULL)
    OR ("kind"='doctor_audio' AND "requestId" IS NULL AND "mime" IN ('audio/webm','audio/mp4','audio/ogg') AND "durationMs" BETWEEN 1 AND 120000 AND "sharedAt" IS NOT NULL))
);
CREATE INDEX "CareMedia_patientId_kind_createdAt_idx" ON "CareMedia"("patientId", "kind", "createdAt");
CREATE INDEX "CareMedia_requestId_createdAt_idx" ON "CareMedia"("requestId", "createdAt");
CREATE UNIQUE INDEX "CareMedia_requestId_sha256_key" ON "CareMedia"("requestId", "sha256");

DO $$ DECLARE table_name TEXT; BEGIN
  FOREACH table_name IN ARRAY ARRAY['ClinicLiveSettings','ClinicQueueDay','LiveCommandReceipt','ProgressPhotoRequest','CareMedia'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', table_name);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN EXECUTE format('REVOKE ALL ON TABLE %I FROM anon', table_name); END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN EXECUTE format('REVOKE ALL ON TABLE %I FROM authenticated', table_name); END IF;
  END LOOP;
END $$;
COMMIT;
