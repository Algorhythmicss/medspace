-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';

-- AlterTable
ALTER TABLE "QueueEntry" ADD COLUMN     "bpDia" INTEGER,
ADD COLUMN     "bpSys" INTEGER,
ADD COLUMN     "pulse" INTEGER,
ADD COLUMN     "tempF" DOUBLE PRECISION,
ADD COLUMN     "weight" DOUBLE PRECISION;
