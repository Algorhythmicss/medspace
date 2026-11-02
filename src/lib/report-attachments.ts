import { AssessmentError } from "@/lib/assessment";
import { inspectAssessmentFile, type AssessmentRawFile } from "@/lib/assessment-uploads";
import { scanAssessmentBytes, type ScanVerdict } from "@/lib/assessment-scanner";

export const MAX_REPORT_FILE_BYTES = 4 * 1024 * 1024;

export async function prepareReportAttachment(
  file: AssessmentRawFile,
  scanner: (bytes: Uint8Array) => Promise<ScanVerdict> = scanAssessmentBytes,
) {
  const inspected = await inspectAssessmentFile(file, MAX_REPORT_FILE_BYTES);
  const verdict = inspected.kind === "image" ? null : await scanner(inspected.bytes);
  if (verdict === "infected") throw new AssessmentError(422, "malware", "The attachment failed its safety scan. Nothing was submitted.");
  return {
    name: inspected.name,
    mime: inspected.mime,
    bytes: new Uint8Array(inspected.bytes),
    scanStatus: inspected.kind === "image" ? "rewritten" : verdict === "clean" ? "clean" : "quarantined",
  };
}

export async function prepareReportDownload(file: AssessmentRawFile) {
  const prepared = await prepareReportAttachment(file);
  if (prepared.scanStatus === "quarantined") {
    throw new AssessmentError(423, "quarantined", "This document is awaiting a private safety scan and cannot be downloaded yet.");
  }
  return prepared;
}
