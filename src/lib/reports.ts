import { db } from "@/lib/db";
import { REPORT_METRICS } from "@/lib/metrics";
import { completeMatchingLabTasks } from "@/lib/tasks";
import { prepareReportAttachment } from "@/lib/report-attachments";
import { AssessmentError } from "@/lib/assessment";

export type ReportValueInput = { type: string; value: number };

export type SaveReportInput = {
  patientId: string;
  title: string;
  kind: string; // lab | imaging | outside_rx | other
  reportDate: Date;
  summary?: string;
  values: ReportValueInput[];
  file?: { name: string; mime: string; bytes: Uint8Array<ArrayBuffer> } | null;
  source?: "clinic" | "patient" | "staff";
  reviewStatus?: "pending" | "verified" | "dismissed";
  reportedConditions?: string;
  reportedAllergies?: string;
  reportedMedications?: string;
  expectedLinkVersion?: number;
};

export { MAX_REPORT_FILE_BYTES as MAX_FILE_BYTES } from "@/lib/report-attachments";

// Core save logic, kept out of the server action so scripts can exercise it.
// Attachments are stored in the database rather than on disk: serverless hosting
// has no persistent filesystem, and this keeps files behind the auth gate.
export async function saveReport(input: SaveReportInput) {
  const source = input.source ?? "clinic";
  const reviewStatus = source === "clinic" ? input.reviewStatus ?? "verified" : "pending";
  const known = new Map(REPORT_METRICS.map((metric) => [metric.type, metric]));
  if (!Array.isArray(input.values) || input.values.length > REPORT_METRICS.length || input.values.some((value) => !value || !known.has(value.type) || !Number.isFinite(value.value))) {
    throw new AssessmentError(400, "report_values", "Choose valid report measurements before saving.");
  }
  const attachment = input.file ? await prepareReportAttachment(input.file) : null;
  return db.$transaction(async (client) => {
    const patients = await client.$queryRaw<Array<{ id: string; linkVersion: number }>>`SELECT "id", "linkVersion" FROM "Patient" WHERE "id" = ${input.patientId} FOR UPDATE`;
    if (!patients.length) throw new AssessmentError(404, "patient", "Patient not found.");
    if ((source === "patient" && input.expectedLinkVersion === undefined) || (input.expectedLinkVersion !== undefined && input.expectedLinkVersion !== patients[0].linkVersion)) {
      throw new AssessmentError(401, "expired", "This link has expired. Ask the clinic for a new one.");
    }
    if (source === "staff") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      const queued = await client.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "QueueEntry" WHERE "patientId" = ${input.patientId} AND "status" = 'waiting' AND "arrivedAt" >= ${today} FOR UPDATE`;
      if (!queued.length) throw new AssessmentError(403, "queue", "This patient is no longer in today’s queue.");
    }
    if (reviewStatus === "pending" && await client.report.count({ where: { patientId: input.patientId, reviewStatus: "pending" } }) >= 8) {
      throw new AssessmentError(429, "pending_limit", "The clinic already has several records waiting for review.");
    }
    const report = await client.report.create({
      data: {
        patientId: input.patientId,
        title: input.title,
        kind: input.kind,
        reportDate: input.reportDate,
        summary: input.summary || null,
        source,
        reviewStatus,
        reportedConditions: input.reportedConditions || null,
        reportedAllergies: input.reportedAllergies || null,
        reportedMedications: input.reportedMedications || null,
        reviewedAt: reviewStatus === "verified" ? new Date() : null,
        fileName: attachment?.name ?? null,
        fileMime: attachment?.mime ?? null,
        fileData: attachment?.bytes ?? null,
      },
    });

    // Only clinic-verified reports may create trend data or close a lab order.
    // Patient/staff uploads are staging records until a doctor accepts them.
    const verified = reviewStatus === "verified";
    const values = verified ? input.values.filter((v) => Number.isFinite(v.value)) : [];
    if (values.length > 0) {
      await client.observation.createMany({
        data: values.map((v) => ({
          patientId: input.patientId,
          type: v.type,
          value: v.value,
          unit: known.get(v.type)?.unit ?? null,
          measuredAt: input.reportDate,
          source: "lab",
        })),
      });
    }

    // an arriving value closes the lab order that asked for it
    await completeMatchingLabTasks(
      input.patientId,
      values.map((v) => v.type),
      input.reportDate,
      client
    );

    await client.patient.update({ where: { id: input.patientId }, data: { updatedAt: new Date() } });
    return report;
  });
}
