import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { readPatientLink } from "@/lib/patientLink";
import { readPatientSession } from "@/lib/session";
import {
  ASSESSMENT_BODY_BYTES, ASSESSMENT_DAILY_LIMIT, ASSESSMENT_HOURLY_ATTEMPTS,
  ASSESSMENT_PENDING_LIMIT, ASSESSMENT_STORAGE_BYTES, ASSESSMENT_VERSION,
  AssessmentError, type AssessmentAnswers,
} from "@/lib/assessment";
import type { AssessmentRawFile, PreparedAssessmentFile } from "@/lib/assessment-uploads";
import type { Prisma } from "@/generated/prisma/client";

export type AssessmentPatient = { p: string; v: number };

export const assessmentSelection = {
  id: true, concern: true, duration: true, context: true, status: true, createdAt: true,
  files: { orderBy: { createdAt: "asc" as const }, select: { id: true, name: true, scanStatus: true } },
} as const;

export function assessmentEnabled(): boolean {
  return process.env.MEDSPACE_PATIENT_ASSESSMENT_ENABLED === "true";
}

export async function recordAssessmentScan(id: string, verdict: "clean" | "infected") {
  await db.assessmentFile.updateMany({
    where: { id, scanStatus: verdict === "infected" ? { in: ["quarantined", "clean"] } : "quarantined" },
    data: { scanStatus: verdict === "infected" ? "rejected" : "clean", scannedAt: new Date() },
  });
  return db.assessmentFile.findUnique({ where: { id }, select: { scanStatus: true } });
}

export function assertAssessmentOrigin(request: Request) {
  const expected = process.env.NODE_ENV === "production" && process.env.MEDSPACE_SITE_URL
    ? new URL(process.env.MEDSPACE_SITE_URL).origin
    : new URL(request.url).origin;
  if (request.headers.get("origin") !== expected || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AssessmentError(403, "origin", "This request must come from your care-plan page.");
  }
}

export async function assessmentPatient(request: Request): Promise<AssessmentPatient | null> {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    if (!/^Bearer [A-Za-z0-9_.-]{20,1600}$/.test(authorization)) return null;
    const ref = await readPatientLink(authorization.slice(7));
    return ref && typeof ref.p === "string" && ref.p.length <= 80 && Number.isSafeInteger(ref.v) ? ref : null;
  }
  return readPatientSession();
}

export function assessmentSubmissionKey(request: Request): string {
  const key = request.headers.get("idempotency-key") || "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(key)) {
    throw new AssessmentError(400, "submission_key", "Please reload the page and try again.");
  }
  return key;
}

async function lockAssessmentPatient(client: Prisma.TransactionClient, patient: AssessmentPatient) {
  const rows = await client.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "Patient" WHERE "id" = ${patient.p} AND "linkVersion" = ${patient.v} FOR UPDATE
  `;
  if (!rows.length) throw new AssessmentError(401, "expired", "Your care link has expired. Ask the clinic for a new one.");
}

export async function reserveAssessmentAttempt(patient: AssessmentPatient): Promise<void> {
  await db.$transaction(async (client) => {
    await lockAssessmentPatient(client, patient);
    const rows = await client.$queryRaw<Array<{ attempts: number }>>`
      INSERT INTO "AssessmentUploadLimit" ("patientId", "windowStartedAt", "attempts")
      VALUES (${patient.p}, CURRENT_TIMESTAMP, 1)
      ON CONFLICT ("patientId") DO UPDATE SET
        "attempts" = CASE WHEN "AssessmentUploadLimit"."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '1 hour'
          THEN 1 ELSE "AssessmentUploadLimit"."attempts" + 1 END,
        "windowStartedAt" = CASE WHEN "AssessmentUploadLimit"."windowStartedAt" <= CURRENT_TIMESTAMP - INTERVAL '1 hour'
          THEN CURRENT_TIMESTAMP ELSE "AssessmentUploadLimit"."windowStartedAt" END
      RETURNING "attempts"
    `;
    if (rows[0].attempts > ASSESSMENT_HOURLY_ATTEMPTS) {
      throw new AssessmentError(429, "rate_limit", "Too many attempts. Please try again in an hour or contact the clinic.");
    }
  });
}

export async function boundedAssessmentForm(request: Request): Promise<FormData> {
  const contentType = request.headers.get("content-type") || "";
  if (!/^multipart\/form-data;\s*boundary=(?:"[0-9A-Za-z'()+_,./:=?-]{1,70}"|[0-9A-Za-z'()+_,./:=?-]{1,70})$/i.test(contentType)) {
    throw new AssessmentError(415, "content_type", "Please use the assessment form to submit your answers.");
  }
  const encoding = request.headers.get("content-encoding");
  if (encoding && encoding !== "identity") throw new AssessmentError(415, "encoding", "Compressed requests are not accepted.");
  const declared = request.headers.get("content-length");
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > ASSESSMENT_BODY_BYTES)) {
    throw new AssessmentError(413, "body_size", "The assessment is too large. Attach no more than 3 MB in total.");
  }
  if (!request.body) throw new AssessmentError(400, "body", "The assessment is empty.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  let expired = false;
  const timer = setTimeout(() => { expired = true; void reader.cancel().catch(() => {}); }, 8000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (expired) throw new AssessmentError(408, "timeout", "The upload took too long. Please try again.");
      if (chunk.done) break;
      total += chunk.value.byteLength;
      if (total > ASSESSMENT_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        throw new AssessmentError(413, "body_size", "The assessment is too large. Attach no more than 3 MB in total.");
      }
      chunks.push(chunk.value);
    }
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
  let form: FormData;
  try {
    form = await new Request("http://assessment.invalid", {
      method: "POST", headers: { "content-type": contentType }, body: Buffer.concat(chunks, total),
    }).formData();
  } catch {
    throw new AssessmentError(400, "multipart", "The upload could not be read. Please choose the files again.");
  }
  const allowed = new Set(["concern", "duration", "context", "consent", "files"]);
  for (const key of form.keys()) {
    if (!allowed.has(key)) throw new AssessmentError(400, "fields", "The assessment contains an unexpected field.");
  }
  if (form.getAll("consent").length !== 1 || form.get("consent") !== "yes") {
    throw new AssessmentError(400, "consent", "Confirm that these answers and files belong to the person whose care plan is open.");
  }
  return form;
}

export function assessmentPayloadHash(answers: AssessmentAnswers, files: AssessmentRawFile[]): string {
  return createHash("sha256").update(JSON.stringify({
    version: ASSESSMENT_VERSION,
    answers,
    files: files.map((file) => ({ name: file.name, mime: file.mime, sha256: createHash("sha256").update(file.bytes).digest("hex") })),
  })).digest("hex");
}

export async function existingAssessment(patient: AssessmentPatient, key: string, hash: string) {
  const existing = await db.initialAssessment.findFirst({
    where: { patientId: patient.p, submissionKey: key, patient: { linkVersion: patient.v } },
    select: { ...assessmentSelection, payloadHash: true },
  });
  if (existing && existing.payloadHash !== hash) throw new AssessmentError(409, "idempotency_conflict", "Those answers changed after submission. Reload before sending a new assessment.");
  return existing;
}

export async function saveInitialAssessment(patient: AssessmentPatient, key: string, hash: string, answers: AssessmentAnswers, files: PreparedAssessmentFile[]) {
  return db.$transaction(async (client) => {
    await lockAssessmentPatient(client, patient);
    const existing = await client.initialAssessment.findUnique({
      where: { patientId_submissionKey: { patientId: patient.p, submissionKey: key } },
      select: { ...assessmentSelection, payloadHash: true },
    });
    if (existing) {
      if (existing.payloadHash !== hash) throw new AssessmentError(409, "idempotency_conflict", "Reload before sending a different assessment.");
      return { assessment: existing, created: false };
    }
    const [pending, recent, storage] = await Promise.all([
      client.initialAssessment.count({ where: { patientId: patient.p, status: "pending" } }),
      client.initialAssessment.count({ where: { patientId: patient.p, createdAt: { gte: new Date(Date.now() - 86_400_000) } } }),
      client.assessmentFile.aggregate({ where: { assessment: { patientId: patient.p } }, _sum: { size: true } }),
    ]);
    if (pending >= ASSESSMENT_PENDING_LIMIT) throw new AssessmentError(429, "pending_limit", "The clinic already has three assessments waiting for review. Please contact the clinic before adding more.");
    if (recent >= ASSESSMENT_DAILY_LIMIT) throw new AssessmentError(429, "daily_limit", "You have sent three assessments in the last 24 hours. Contact the clinic if you need to add something.");
    const incomingBytes = files.reduce((sum, file) => sum + file.size, 0);
    if (incomingBytes > 0 && (storage._sum.size || 0) + incomingBytes > ASSESSMENT_STORAGE_BYTES) {
      throw new AssessmentError(413, "storage_limit", "Your attachment allowance is full. Please contact the clinic.");
    }
    const assessment = await client.initialAssessment.create({
      data: {
        patientId: patient.p, submissionKey: key, payloadHash: hash, questionVersion: ASSESSMENT_VERSION,
        ...answers, files: { create: files },
      },
      select: assessmentSelection,
    });
    return { assessment, created: true };
  }, { timeout: 5000 });
}
