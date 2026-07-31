-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "planShareCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "planSharedAt" TIMESTAMP(3);
