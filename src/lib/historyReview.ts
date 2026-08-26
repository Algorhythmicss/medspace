import { db } from "@/lib/db";
import { historyReviewPromotion, type HistoryReviewDecision } from "@/lib/onboarding";
import type { PrismaClient } from "@/generated/prisma/client";

export async function reviewHistorySubmission(
  reportId: string,
  decision: HistoryReviewDecision,
  reviewedAt = new Date(),
  database: PrismaClient = db
): Promise<{ changed: boolean; patientId: string | null }> {
  const report = await database.report.findUnique({
    where: { id: reportId },
    select: {
      id: true,
      patientId: true,
      reviewStatus: true,
      reportedConditions: true,
      reportedAllergies: true,
      reportedMedications: true,
    },
  });
  if (!report || report.reviewStatus !== "pending") {
    return { changed: false, patientId: report?.patientId ?? null };
  }

  if (decision === "dismiss") {
    // Conditional transition: if another doctor/tab accepted first, this click
    // becomes a no-op instead of overwriting a verified record as dismissed.
    const dismissed = await database.report.updateMany({
      where: { id: report.id, reviewStatus: "pending" },
      data: { reviewStatus: "dismissed", reviewedAt },
    });
    return { changed: dismissed.count === 1, patientId: report.patientId };
  }

  const changed = await database.$transaction(async (tx) => {
    // Claim the pending row before promoting anything into the chart. A
    // concurrent reviewer will wait, see that it is no longer pending, and
    // add nothing — so one submission can be promoted at most once.
    const claimed = await tx.report.updateMany({
      where: { id: report.id, reviewStatus: "pending" },
      data: { reviewStatus: "verified", reviewedAt },
    });
    if (claimed.count === 0) return false;

    const patient = await tx.patient.findUnique({
      where: { id: report.patientId },
      select: {
        reportedMedications: true,
        conditions: { select: { name: true } },
        allergies: { select: { substance: true } },
      },
    });
    if (!patient) return false;
    const promotion = historyReviewPromotion({
      decision: "accept",
      existingConditions: patient.conditions.map((condition) => condition.name),
      existingAllergies: patient.allergies.map((allergy) => allergy.substance),
      existingMedications: patient.reportedMedications,
      reportedConditions: report.reportedConditions,
      reportedAllergies: report.reportedAllergies,
      reportedMedications: report.reportedMedications,
    });
    if (promotion.conditionsToAdd.length) {
      await tx.condition.createMany({
        data: promotion.conditionsToAdd.map((name) => ({
          patientId: report.patientId,
          name,
          status: "active",
        })),
      });
    }
    if (promotion.allergiesToAdd.length) {
      await tx.allergy.createMany({
        data: promotion.allergiesToAdd.map((substance) => ({
          patientId: report.patientId,
          substance,
        })),
      });
    }
    await tx.patient.update({
      where: { id: report.patientId },
      data: {
        ...(report.reportedMedications
          ? { reportedMedications: promotion.medicationHistory }
          : {}),
        historyUpdatedAt: reviewedAt,
      },
    });
    return true;
  });

  return { changed, patientId: report.patientId };
}
