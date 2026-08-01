-- CreateTable
CREATE TABLE "QueueEntry" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "arrivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "seenAt" TIMESTAMP(3),
    "note" TEXT,

    CONSTRAINT "QueueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QueueEntry_status_arrivedAt_idx" ON "QueueEntry"("status", "arrivedAt");

-- CreateIndex
CREATE INDEX "QueueEntry_patientId_status_idx" ON "QueueEntry"("patientId", "status");

-- AddForeignKey
ALTER TABLE "QueueEntry" ADD CONSTRAINT "QueueEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
