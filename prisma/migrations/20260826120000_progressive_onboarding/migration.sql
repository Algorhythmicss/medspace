-- Progressive onboarding: keep patient/staff-submitted history separate until
-- a doctor reviews it, while letting accepted pre-MedSpace medicines remain
-- visible until the first native prescription replaces them in the UI.
ALTER TABLE "Patient"
ADD COLUMN "reportedMedications" TEXT,
ADD COLUMN "historyUpdatedAt" TIMESTAMP(3);

ALTER TABLE "Report"
ADD COLUMN "source" TEXT NOT NULL DEFAULT 'clinic',
ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'verified',
ADD COLUMN "reportedConditions" TEXT,
ADD COLUMN "reportedAllergies" TEXT,
ADD COLUMN "reportedMedications" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Report_patientId_reviewStatus_createdAt_idx"
ON "Report"("patientId", "reviewStatus", "createdAt");

