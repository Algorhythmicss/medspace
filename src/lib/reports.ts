import { db } from "@/lib/db";
import { REPORT_METRICS } from "@/lib/metrics";
import { completeMatchingLabTasks } from "@/lib/tasks";

export type ReportValueInput = { type: string; value: number };

export type SaveReportInput = {
  patientId: string;
  title: string;
  kind: string; // lab | imaging | outside_rx | other
  reportDate: Date;
  summary?: string;
  values: ReportValueInput[];
  file?: { name: string; mime: string; bytes: Uint8Array<ArrayBuffer> } | null;
};

export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Core save logic, kept out of the server action so scripts can exercise it.
// Attachments are stored in the database rather than on disk: serverless hosting
// has no persistent filesystem, and this keeps files behind the auth gate.
export async function saveReport(input: SaveReportInput) {
  const report = await db.report.create({
    data: {
      patientId: input.patientId,
      title: input.title,
      kind: input.kind,
      reportDate: input.reportDate,
      summary: input.summary || null,
      fileName: input.file?.name ?? null,
      fileMime: input.file?.mime ?? null,
      fileData: input.file?.bytes ?? null,
    },
  });

  const known = new Map(REPORT_METRICS.map((m) => [m.type, m]));
  const values = input.values.filter((v) => Number.isFinite(v.value));
  if (values.length > 0) {
    await db.observation.createMany({
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
    input.reportDate
  );

  await db.patient.update({ where: { id: input.patientId }, data: { updatedAt: new Date() } });
  return report;
}
