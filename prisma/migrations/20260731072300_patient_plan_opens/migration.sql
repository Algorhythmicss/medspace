-- AlterTable
ALTER TABLE "Patient" ADD COLUMN     "planFirstOpenedAt" TIMESTAMP(3),
ADD COLUMN     "planLastOpenedAt" TIMESTAMP(3),
ADD COLUMN     "planOpenCount" INTEGER NOT NULL DEFAULT 0;
