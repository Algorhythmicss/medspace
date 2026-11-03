"use server";

import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { supersedeStaleLabTasks } from "@/lib/tasks";
import { saveReport, MAX_FILE_BYTES } from "@/lib/reports";
import { AssessmentError } from "@/lib/assessment";
import { reserveAssessmentAttempt } from "@/lib/assessment-server";
import { mergePatients } from "@/lib/merge";
import { sessionCookieName } from "@/lib/auth";
import {
  assertClinicSession,
  setPatientSession,
  clearPatientSession,
  readPatientSession,
  assertQueueAccess,
  clearStaffSession,
} from "@/lib/session";
import { supabaseForAuth } from "@/lib/supabase";
import { hasActiveAccess } from "@/lib/patientAccess";
import { HOME_METRICS } from "@/lib/metrics";
import { storablePhone, phoneQuery } from "@/lib/phone";
import {
  parsePatientRoster,
  prepareRosterImport,
  rosterLookupKeys,
} from "@/lib/rosterCsv";
import { historySubmissionSummary, historyTerms } from "@/lib/onboarding";
import {
  normalizePrescriptionSet,
  type PrescriptionSetInput,
} from "@/lib/prescriptionSets";
import { normalizeMedicalDocument } from "@/lib/medicalDocuments";
import { normalizeVisitInput, type VisitInput } from "@/lib/visitInput";
import { reviewHistorySubmission } from "@/lib/historyReview";
import {
  readPatientLink,
  createBindToken,
  readChooserToken,
} from "@/lib/patientLink";
import { siteUrl } from "@/lib/siteUrl";
import {
  clinicCommand,
  liveClinicEnabled,
  lockClinic,
  touchClinic,
  finishQueueVisit,
} from "@/lib/live-clinic-server";
import { clinicDay, clinicDayStart, ClinicError } from "@/lib/live-clinic";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type RxItemInput = VisitInput["items"][number];
export type NewVisitInput = VisitInput;

export async function createVisit(input: NewVisitInput) {
  await assertClinicSession();
  const normalized = normalizeVisitInput(input);
  if (!normalized.ok) return { ok: false as const, error: normalized.error };
  const value = normalized.value;
  if (liveClinicEnabled() && !value.commandId)
    return {
      ok: false as const,
      error:
        "Refresh the visit form before saving so this visit can be retried safely.",
    };
  const now = new Date();
  const followUpDate = value.followUpInDays
    ? new Date(now.getTime() + value.followUpInDays * 86400000)
    : null;

  // A visit touches the chart, observations, care plan, queue and drug memory.
  // Commit that entire story atomically so a mid-save database failure can
  // never leave a prescription without its tasks or a half-cleared queue.
  if (
    liveClinicEnabled() &&
    !value.complaint &&
    !value.diagnosis &&
    !value.advice &&
    !value.items.length &&
    !followUpDate
  )
    return {
      ok: false as const,
      error:
        "Add the consultation notes, instructions or follow-up before completing this visit.",
    };
  const saveVisit = async (tx: Prisma.TransactionClient) => {
    if (liveClinicEnabled()) await lockClinic(tx);
    const patient = await tx.patient.findUnique({
      where: { id: value.patientId },
      select: { id: true },
    });
    if (!patient) throw new Error("Patient not found.");

    const created = await tx.visit.create({
      data: {
        patientId: value.patientId,
        visitDate: now,
        complaint: value.complaint,
        diagnosis: value.diagnosis,
        followUpDate,
        prescription:
          value.items.length > 0 || value.advice
            ? {
                create: {
                  advice: value.advice,
                  items: {
                    create: value.items.map((item, i) => ({
                      sortOrder: i,
                      drugName: item.drugName,
                      frequency: item.frequency,
                      duration: item.duration || null,
                      instructions: item.instructions || null,
                    })),
                  },
                },
              }
            : undefined,
      },
    });

    const obs: Array<{ type: string; value: number; unit: string }> = [];
    if (value.vitals.bpSys)
      obs.push({ type: "BP_SYS", value: value.vitals.bpSys, unit: "mmHg" });
    if (value.vitals.bpDia)
      obs.push({ type: "BP_DIA", value: value.vitals.bpDia, unit: "mmHg" });
    if (value.vitals.pulse)
      obs.push({ type: "PULSE", value: value.vitals.pulse, unit: "bpm" });
    if (value.vitals.weight)
      obs.push({ type: "WEIGHT", value: value.vitals.weight, unit: "kg" });
    if (value.vitals.tempF)
      obs.push({ type: "TEMP", value: value.vitals.tempF, unit: "°F" });
    if (obs.length > 0) {
      await tx.observation.createMany({
        data: obs.map((observation) => ({
          ...observation,
          patientId: value.patientId,
          visitId: created.id,
          measuredAt: now,
        })),
      });
    }

    const tasks: Array<{ kind: string; title: string; dueDate: Date | null }> =
      [];
    if (followUpDate) {
      tasks.push({
        kind: "FOLLOW_UP",
        title: value.diagnosis
          ? `Review: ${value.diagnosis}`
          : "Follow-up visit",
        dueDate: followUpDate,
      });
    }
    for (const lab of value.labTasks) {
      const labDue = followUpDate
        ? new Date(followUpDate.getTime() - 7 * 86400000)
        : new Date(now.getTime() + 14 * 86400000);
      tasks.push({
        kind: "LAB_TEST",
        title: lab,
        dueDate: labDue < now ? followUpDate : labDue,
      });
    }
    if (tasks.length > 0) {
      await tx.carePlanTask.createMany({
        data: tasks.map((task) => ({
          ...task,
          patientId: value.patientId,
          visitId: created.id,
          status: "pending",
        })),
      });
    }
    if (liveClinicEnabled() && value.photoInstructions) {
      const followup = await tx.carePlanTask.findFirst({
        where: {
          visitId: created.id,
          kind: "FOLLOW_UP",
          patientId: value.patientId,
        },
        select: { id: true },
      });
      if (!followup)
        throw new ClinicError(
          400,
          "followup",
          "A follow-up is required for progress photos.",
        );
      await tx.progressPhotoRequest.create({
        data: {
          patientId: value.patientId,
          taskId: followup.id,
          instructions: value.photoInstructions,
        },
      });
    }

    await supersedeStaleLabTasks(
      value.patientId,
      value.labTasks,
      created.id,
      tx,
    );
    await tx.carePlanTask.updateMany({
      where: {
        patientId: value.patientId,
        status: "pending",
        kind: "FOLLOW_UP",
        OR: [{ visitId: null }, { visitId: { not: created.id } }],
      },
      data: { status: "done", completedAt: now },
    });
    if (liveClinicEnabled()) await finishQueueVisit(tx, value.patientId);
    else
      await tx.queueEntry.updateMany({
        where: { patientId: value.patientId, status: "waiting" },
        data: { status: "seen", seenAt: now },
      });
    await tx.patient.update({
      where: { id: value.patientId },
      data: { updatedAt: now },
    });

    for (const item of value.items) {
      await tx.drug.upsert({
        where: { name: item.drugName },
        create: {
          name: item.drugName,
          defaultFrequency: item.frequency,
          defaultDuration: item.duration || null,
          defaultInstructions: item.instructions || null,
          useCount: 1,
        },
        update: { useCount: { increment: 1 } },
      });
    }

    return { id: created.id };
  };
  let visit: { id: string };
  try {
    visit =
      liveClinicEnabled() && value.commandId
        ? await clinicCommand(
            { kind: "doctor" },
            value.commandId,
            "finish_visit",
            value,
            saveVisit,
          )
        : await db.$transaction(async (tx) => {
            const result = await saveVisit(tx);
            if (liveClinicEnabled()) await touchClinic(tx);
            return result;
          });
  } catch (error) {
    if (error instanceof ClinicError)
      return { ok: false as const, error: error.message };
    throw error;
  }

  revalidatePath(`/patients/${value.patientId}`);
  revalidatePath("/");
  revalidatePath("/followups");
  revalidatePath("/queue"); // the patient just came off the front-desk queue
  redirect(`/visits/${visit.id}/rx`);
}

export type PrescriptionSetState =
  | {
      ok: true;
      set: {
        id: string;
        name: string;
        advice: string | null;
        followUpInDays: number | null;
        labTasks: string[];
        items: RxItemInput[];
      };
    }
  | { ok: false; error: string };

// Saved sets are clinic-owned accelerators, not treatment decisions. Applying
// one only pre-fills the form; the doctor still sees and can change every field
// before the visit is committed.
export async function savePrescriptionSet(
  input: PrescriptionSetInput,
): Promise<PrescriptionSetState> {
  await assertClinicSession();
  const normalized = normalizePrescriptionSet(input);
  if (!normalized.ok) return normalized;
  const value = normalized.value;

  try {
    const saved = await db.prescriptionSet.upsert({
      where: { nameKey: value.nameKey },
      create: {
        name: value.name,
        nameKey: value.nameKey,
        advice: value.advice,
        followUpInDays: value.followUpInDays,
        labTasks: value.labTasks,
        items: {
          create: value.items.map((item, sortOrder) => ({
            ...item,
            sortOrder,
          })),
        },
      },
      update: {
        name: value.name,
        advice: value.advice,
        followUpInDays: value.followUpInDays,
        labTasks: value.labTasks,
        items: {
          deleteMany: {},
          create: value.items.map((item, sortOrder) => ({
            ...item,
            sortOrder,
          })),
        },
      },
      include: { items: { orderBy: { sortOrder: "asc" } } },
    });

    return {
      ok: true,
      set: {
        id: saved.id,
        name: saved.name,
        advice: saved.advice,
        followUpInDays: saved.followUpInDays,
        labTasks: saved.labTasks,
        items: saved.items.map((item) => ({
          drugName: item.drugName,
          frequency: item.frequency,
          duration: item.duration ?? undefined,
          instructions: item.instructions ?? undefined,
        })),
      },
    };
  } catch (error) {
    console.error("failed to save prescription set", error);
    return {
      ok: false,
      error: "The set could not be saved. Please try again.",
    };
  }
}

export async function deletePrescriptionSet(id: string) {
  await assertClinicSession();
  const safeId = String(id ?? "")
    .trim()
    .slice(0, 80);
  if (!safeId) return { ok: false as const };
  await db.prescriptionSet.deleteMany({ where: { id: safeId } });
  return { ok: true as const };
}

// File numbers are the clinic's human-facing id and must be unique. Allocating
// them as max()+1 races when two intakes land together (doctor + front desk),
// so retry a few times on the unique-collision before giving up — cheap, and it
// keeps a simultaneous walk-in registration from throwing in the staff's face.
async function createPatientWithFileNumber(
  data: Omit<Parameters<typeof db.patient.create>[0]["data"], "fileNumber">,
) {
  if (liveClinicEnabled())
    return db.$transaction(async (tx) => {
      await lockClinic(tx);
      const maximum =
        (await tx.patient.aggregate({ _max: { fileNumber: true } }))._max
          .fileNumber ?? 100;
      return tx.patient.create({ data: { ...data, fileNumber: maximum + 1 } });
    });
  for (let attempt = 0; ; attempt++) {
    const maxFile = await db.patient.aggregate({ _max: { fileNumber: true } });
    try {
      return await db.patient.create({
        data: { ...data, fileNumber: (maxFile._max.fileNumber ?? 100) + 1 },
      });
    } catch (err) {
      const isCollision = (err as { code?: string }).code === "P2002";
      if (isCollision && attempt < 4) continue;
      throw err;
    }
  }
}

export async function createPatient(formData: FormData) {
  await assertClinicSession();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  // Normalised on write — see storablePhone. Search and duplicate detection both
  // depend on one patient having exactly one representation of their number.
  const phone = storablePhone(String(formData.get("phone") ?? ""));
  const ageRaw = String(formData.get("age") ?? "").trim();
  const sex = String(formData.get("sex") ?? "").trim() || null;

  const patient = await createPatientWithFileNumber({
    name,
    phone,
    sex,
    ageYears: ageRaw ? parseInt(ageRaw, 10) : null,
  });
  revalidatePath("/");
  redirect(`/patients/${patient.id}`);
}

export async function createReport(formData: FormData) {
  await assertClinicSession();
  const patientId = String(formData.get("patientId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!patientId || !title)
    return {
      ok: false as const,
      message: "Add a patient and report title before saving.",
    };

  const kind = String(formData.get("kind") ?? "lab");
  const dateRaw = String(formData.get("reportDate") ?? "");
  const summary = String(formData.get("summary") ?? "").trim();
  const valuesRaw = String(formData.get("values") ?? "[]");

  let values: { type: string; value: number }[] = [];
  try {
    values = JSON.parse(valuesRaw);
  } catch {
    values = [];
  }

  const fileEntry = formData.get("file");
  let file: {
    name: string;
    mime: string;
    bytes: Uint8Array<ArrayBuffer>;
  } | null = null;
  if (fileEntry instanceof File && fileEntry.size > 0) {
    if (fileEntry.size > MAX_FILE_BYTES)
      return {
        ok: false as const,
        message: "That attachment is over 4 MB. Choose a smaller file.",
      };
    const declared = fileEntry.type || "application/octet-stream";
    file = {
      name: fileEntry.name,
      mime: declared.toLowerCase(),
      bytes: new Uint8Array(await fileEntry.arrayBuffer()),
    };
  }

  try {
    await saveReport({
      patientId,
      title,
      kind,
      reportDate: dateRaw ? new Date(dateRaw) : new Date(),
      summary: summary || undefined,
      values,
      file,
    });
  } catch (error) {
    if (error instanceof AssessmentError)
      return { ok: false as const, message: error.message };
    console.error("report submission failed");
    return {
      ok: false as const,
      message:
        "The report could not be saved. Your entries are kept on this device; please retry.",
    };
  }

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
  redirect(`/patients/${patientId}`);
}

const HISTORY_KINDS = new Set(["outside_rx", "lab", "imaging", "other"]);
const MAX_ROSTER_BYTES = 512 * 1024;
const MAX_ROSTER_ROWS = 500;

export type HistorySubmissionState = {
  ok: boolean;
  message: string;
};

export type RosterImportState = {
  ok: boolean;
  message: string;
  added?: number;
  skipped?: number;
};

export type MedicalDocumentState = {
  ok: boolean;
  message: string;
};

const clipped = (value: FormDataEntryValue | null, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

async function historyFile(formData: FormData) {
  const entry = formData.get("file");
  if (!(entry instanceof File) || entry.size === 0) return null;
  if (entry.size > MAX_FILE_BYTES) throw new Error("file_too_large");
  const declared = entry.type || "application/octet-stream";
  return {
    name: entry.name,
    mime: declared.toLowerCase(),
    bytes: new Uint8Array(await entry.arrayBuffer()),
  };
}

async function saveHistorySubmission(
  patientId: string,
  source: "patient" | "staff",
  formData: FormData,
  expectedLinkVersion: number,
): Promise<HistorySubmissionState> {
  const conditions = clipped(formData.get("conditions"), 1500);
  const allergies = clipped(formData.get("allergies"), 1000);
  const medications = clipped(formData.get("medications"), 2500);
  const note = clipped(formData.get("note"), 2500);
  const kindInput = clipped(formData.get("kind"), 30);
  const kind = HISTORY_KINDS.has(kindInput) ? kindInput : "outside_rx";
  const title =
    clipped(formData.get("title"), 160) ||
    (kind === "outside_rx"
      ? "Previous prescription"
      : "Previous medical record");

  let file: Awaited<ReturnType<typeof historyFile>>;
  try {
    file = await historyFile(formData);
  } catch (error) {
    if ((error as Error).message === "file_too_large") {
      return {
        ok: false,
        message: "That file is over 4MB. Please choose a smaller photo or PDF.",
      };
    }
    return {
      ok: false,
      message: "The file could not be read. Please try another one.",
    };
  }
  if (!conditions && !allergies && !medications && !note && !file) {
    return {
      ok: false,
      message: "Add at least one detail or attach a record.",
    };
  }

  // A leaked/forwarded link must not be usable as an unbounded database upload
  // primitive. Eight unreviewed submissions is enough for a paper file and
  // forces clinic review before more storage can be consumed.
  const pending = await db.report.count({
    where: { patientId, reviewStatus: "pending" },
  });
  if (pending >= 8) {
    return {
      ok: false,
      message: "The clinic already has several records waiting for review.",
    };
  }

  const dateRaw = clipped(formData.get("reportDate"), 20);
  const parsedDate = dateRaw ? new Date(`${dateRaw}T12:00:00`) : new Date();
  const reportDate =
    Number.isFinite(parsedDate.getTime()) && parsedDate <= new Date()
      ? parsedDate
      : new Date();

  try {
    await saveReport({
      patientId,
      title,
      kind,
      reportDate,
      summary: historySubmissionSummary({
        conditions,
        allergies,
        medications,
        note,
      }),
      values: [],
      file,
      source,
      reviewStatus: "pending",
      reportedConditions: conditions,
      reportedAllergies: allergies,
      reportedMedications: medications,
      expectedLinkVersion,
    });
  } catch (error) {
    if (error instanceof AssessmentError)
      return { ok: false, message: error.message };
    console.error("failed to save history submission");
    return {
      ok: false,
      message: "The record could not be saved. Please try again.",
    };
  }

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/plan");
  return { ok: true, message: "Sent to the clinic for the doctor to review." };
}

// Patient-side: authenticated by the signed plan link or patient session. The
// patient id is always derived server-side; a hidden input can never select a
// different chart.
export async function submitPatientHistory(
  _previous: HistorySubmissionState,
  formData: FormData,
): Promise<HistorySubmissionState> {
  if (clipped(formData.get("consent"), 10) !== "yes") {
    const hindi = clipped(formData.get("language"), 10) === "hi";
    return {
      ok: false,
      message: hindi
        ? "पुष्टि करें कि यह रिकॉर्ड उसी व्यक्ति का है जिसकी देखभाल योजना खुली है।"
        : "Confirm that this record belongs to the person whose care plan is open.",
    };
  }
  const planToken = clipped(formData.get("planToken"), 1600) || undefined;
  const reference = planToken
    ? await readPatientLink(planToken)
    : await readPatientSession();
  if (!reference)
    return {
      ok: false,
      message: "This link has expired. Ask the clinic for a new one.",
    };
  try {
    await reserveAssessmentAttempt(reference);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AssessmentError
          ? error.message
          : "The clinic could not receive this record. Please retry.",
    };
  }
  return saveHistorySubmission(reference.p, "patient", formData, reference.v);
}

export async function createMedicalDocument(
  _previous: MedicalDocumentState,
  formData: FormData,
): Promise<MedicalDocumentState> {
  await assertClinicSession();
  if (clipped(formData.get("doctorConfirmed"), 10) !== "yes") {
    return {
      ok: false,
      message: "Review and confirm the final wording before issue.",
    };
  }
  const normalized = normalizeMedicalDocument({
    patientId: clipped(formData.get("patientId"), 80),
    visitId: clipped(formData.get("visitId"), 80) || undefined,
    kind: clipped(formData.get("kind"), 40),
    title: clipped(formData.get("title"), 160),
    body: clipped(formData.get("body"), 5000),
    recipient: clipped(formData.get("recipient"), 240) || undefined,
    validFrom: clipped(formData.get("validFrom"), 20) || undefined,
    validUntil: clipped(formData.get("validUntil"), 20) || undefined,
  });
  if (!normalized.ok) return { ok: false, message: normalized.error };
  const value = normalized.value;

  const [patient, linkedVisit] = await Promise.all([
    db.patient.findUnique({
      where: { id: value.patientId },
      select: { id: true },
    }),
    value.visitId
      ? db.visit.findFirst({
          where: { id: value.visitId, patientId: value.patientId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  if (!patient) return { ok: false, message: "Patient not found." };
  if (value.visitId && !linkedVisit) {
    return {
      ok: false,
      message: "That visit does not belong to this patient.",
    };
  }

  const atNoon = (date: string | null) =>
    date ? new Date(`${date}T12:00:00+05:30`) : null;
  const document = await db.medicalDocument.create({
    data: {
      patientId: value.patientId,
      visitId: value.visitId,
      kind: value.kind,
      title: value.title,
      body: value.body,
      recipient: value.recipient,
      validFrom: atNoon(value.validFrom),
      validUntil: atNoon(value.validUntil),
    },
  });

  revalidatePath(`/patients/${value.patientId}`);
  redirect(`/documents/${document.id}`);
}

// Front-desk-side: staff can stage records only for somebody currently in the
// live queue. They never read the chart and their submission still needs doctor
// review, preserving the queue-only role boundary.
export async function submitStaffHistory(
  _previous: HistorySubmissionState,
  formData: FormData,
): Promise<HistorySubmissionState> {
  await assertQueueAccess();
  const patientId = clipped(formData.get("patientId"), 80);
  if (!patientId) return { ok: false, message: "Patient not found." };
  const todayStart = clinicDayStart();
  const inQueue = await db.queueEntry.count({
    where: { patientId, status: "waiting", arrivedAt: { gte: todayStart } },
  });
  if (!inQueue)
    return {
      ok: false,
      message: "This patient is no longer in today’s queue.",
    };
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { linkVersion: true },
  });
  if (!patient) return { ok: false, message: "Patient not found." };
  try {
    await reserveAssessmentAttempt({ p: patientId, v: patient.linkVersion });
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof AssessmentError
          ? error.message
          : "The clinic could not receive this record. Please retry.",
    };
  }
  return saveHistorySubmission(
    patientId,
    "staff",
    formData,
    patient.linkVersion,
  );
}

async function addMissingHistory(
  client: Pick<Prisma.TransactionClient, "condition" | "allergy">,
  patientId: string,
  conditionsText: string | null,
  allergiesText: string | null,
) {
  const conditions = historyTerms(conditionsText);
  const allergies = historyTerms(allergiesText);
  for (const name of conditions) {
    const exists = await client.condition.findFirst({
      where: { patientId, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (!exists)
      await client.condition.create({
        data: { patientId, name, status: "active" },
      });
  }
  for (const substance of allergies) {
    const exists = await client.allergy.findFirst({
      where: {
        patientId,
        substance: { equals: substance, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!exists)
      await client.allergy.create({ data: { patientId, substance } });
  }
}

export async function reviewPatientHistory(formData: FormData) {
  await assertClinicSession();
  const reportId = clipped(formData.get("reportId"), 80);
  const decision = clipped(formData.get("decision"), 20);
  if (!reportId || (decision !== "accept" && decision !== "dismiss")) return;

  const result = await reviewHistorySubmission(
    reportId,
    decision === "accept" ? "accept" : "dismiss",
  );
  if (!result.patientId) return;
  revalidatePath(`/patients/${result.patientId}`);
  revalidatePath("/");
  redirect(`/patients/${result.patientId}`);
}

export async function saveBaselineHistory(formData: FormData) {
  await assertClinicSession();
  const patientId = clipped(formData.get("patientId"), 80);
  if (!patientId) return;
  const conditions = clipped(formData.get("conditions"), 1500);
  const allergies = clipped(formData.get("allergies"), 1000);
  const medications = clipped(formData.get("medications"), 2500);
  const note = clipped(formData.get("note"), 2500);
  if (!conditions && !allergies && !medications && !note)
    redirect(`/patients/${patientId}`);

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient) return;
  const now = new Date();
  await db.$transaction(async (tx) => {
    await addMissingHistory(tx, patientId, conditions, allergies);
    await tx.patient.update({
      where: { id: patientId },
      data: {
        ...(medications ? { reportedMedications: medications } : {}),
        historyUpdatedAt: now,
      },
    });
    if (note) {
      await tx.report.create({
        data: {
          patientId,
          title: "Previous treatment note",
          kind: "other",
          reportDate: now,
          summary: note,
          source: "clinic",
          reviewStatus: "verified",
          reviewedAt: now,
        },
      });
    }
  });
  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
  redirect(`/patients/${patientId}`);
}

export async function importPatientRoster(
  _previous: RosterImportState,
  formData: FormData,
): Promise<RosterImportState> {
  await assertClinicSession();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: "Choose a CSV file first." };
  }
  if (file.size > MAX_ROSTER_BYTES) {
    return { ok: false, message: "Keep the CSV under 512KB." };
  }

  let parsed;
  try {
    parsed = parsePatientRoster(await file.text());
  } catch (error) {
    const message = (error as Error).message;
    return {
      ok: false,
      message:
        message === "missing_name_column"
          ? "The CSV needs a Name column."
          : "That CSV could not be read.",
    };
  }
  if (parsed.rows.length === 0)
    return { ok: false, message: "No patient rows were found." };
  if (parsed.rows.length > MAX_ROSTER_ROWS) {
    return {
      ok: false,
      message: `Import up to ${MAX_ROSTER_ROWS} patients at a time.`,
    };
  }

  const { phones, fileNumbers: preferredFiles } = rosterLookupKeys(parsed.rows);
  const [existingPhones, conflictingFiles, maxFile] = await Promise.all([
    phones.length
      ? db.patient.findMany({
          where: { phone: { in: phones } },
          select: { phone: true },
        })
      : Promise.resolve([]),
    preferredFiles.length
      ? db.patient.findMany({
          where: { fileNumber: { in: preferredFiles } },
          select: { fileNumber: true },
        })
      : Promise.resolve([]),
    db.patient.aggregate({ _max: { fileNumber: true } }),
  ]);

  const { data, skipped } = prepareRosterImport({
    rows: parsed.rows,
    existingPhones: existingPhones.map((patient) => patient.phone),
    existingFileNumbers: conflictingFiles.map((patient) => patient.fileNumber),
    maxFileNumber: maxFile._max.fileNumber,
    initiallySkipped: parsed.skipped,
  });

  if (data.length === 0) {
    return {
      ok: true,
      message:
        "No new patients were added; every row already matched a phone on file.",
      added: 0,
      skipped,
    };
  }
  try {
    await db.patient.createMany({ data });
  } catch (error) {
    console.error("failed to import patient roster", error);
    return {
      ok: false,
      message:
        "The import collided with another update. Please try it once more.",
    };
  }

  revalidatePath("/");
  revalidatePath("/patients/new");
  return {
    ok: true,
    message: `${data.length} patient${data.length === 1 ? "" : "s"} added.`,
    added: data.length,
    skipped,
  };
}

export async function updatePatient(formData: FormData) {
  await assertClinicSession();
  const patientId = String(formData.get("patientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!patientId || !name) return;

  const ageRaw = String(formData.get("age") ?? "").trim();
  const age = ageRaw ? parseInt(ageRaw, 10) : null;

  await db.patient.update({
    where: { id: patientId },
    data: {
      name,
      phone: storablePhone(String(formData.get("phone") ?? "")),
      sex: String(formData.get("sex") ?? "").trim() || null,
      ageYears: age != null && Number.isFinite(age) ? age : null,
      address: String(formData.get("address") ?? "").trim() || null,
      abhaId: String(formData.get("abhaId") ?? "").trim() || null,
      language: String(formData.get("language") ?? "") === "hi" ? "hi" : "en",
    },
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
  redirect(`/patients/${patientId}`);
}

export async function updateClinicSettings(formData: FormData) {
  await assertClinicSession();
  const clinicName = clipped(formData.get("clinicName"), 160);
  const doctorName = clipped(formData.get("doctorName"), 160);
  const regNumber = clipped(formData.get("regNumber"), 120);
  if (!clinicName || !doctorName || !regNumber) return;

  const data = {
    clinicName,
    doctorName,
    regNumber,
    degrees: clipped(formData.get("degrees"), 160) || null,
    phone: storablePhone(clipped(formData.get("phone"), 40)),
    address: clipped(formData.get("address"), 500) || null,
  };
  await db.clinic.upsert({
    where: { id: "clinic" },
    create: { id: "clinic", ...data },
    update: data,
  });
  const patientCount = await db.patient.count();
  revalidatePath("/");
  revalidatePath("/welcome");
  revalidatePath("/plan");
  redirect(patientCount === 0 ? "/patients/import" : "/");
}

export async function mergePatientRecords(formData: FormData) {
  await assertClinicSession();
  const keeperId = String(formData.get("keeperId") ?? "");
  const duplicateId = String(formData.get("duplicateId") ?? "");
  if (!keeperId || !duplicateId || keeperId === duplicateId) return;

  await mergePatients(keeperId, duplicateId);

  revalidatePath(`/patients/${keeperId}`);
  revalidatePath("/");
  revalidatePath("/followups");
  redirect(`/patients/${keeperId}`);
}

export async function signOut() {
  const jar = await cookies();
  jar.delete(sessionCookieName);
  redirect("/login");
}

export async function updateStickyNote(formData: FormData) {
  await assertClinicSession();
  const patientId = String(formData.get("patientId") ?? "");
  if (!patientId) return;
  const note = String(formData.get("note") ?? "").trim();
  await db.patient.update({
    where: { id: patientId },
    data: { stickyNote: note || null },
  });
  revalidatePath(`/patients/${patientId}`);
}

// Called when the doctor hands the plan link over — the WhatsApp button or the
// copy button. Pairs with the open counters written from the patient page, so
// the pair answers "sent twice, never opened" rather than just "not opened".
// Deliberately does not revalidate: it fires while the doctor is being sent to
// WhatsApp, and re-rendering the chart underneath them would be pointless work.
export async function recordPlanShare(patientId: string) {
  await assertClinicSession();
  if (!patientId) return;
  try {
    await db.patient.update({
      where: { id: patientId },
      data: { planSharedAt: new Date(), planShareCount: { increment: 1 } },
    });
  } catch (err) {
    // Sharing must never fail in the doctor's face — the link still works.
    console.error("failed to record plan share", err);
  }
}

// Patient-side: the follow-up reply tapped on their own plan. Authenticated by
// the plan token (on /p/<token>) or the patient session (on /plan) — NEVER the
// clinic passcode. Deriving the patient from the token/session server-side is
// what stops one patient answering for another.
const REPLY_KINDS = new Set(["coming", "booked", "not_coming"]);
export async function recordPlanReply(kind: string, planToken?: string) {
  if (!REPLY_KINDS.has(kind)) return;
  const patientId = await authedPatientId(planToken);
  if (!patientId) return;
  try {
    await db.patient.update({
      where: { id: patientId },
      data: { planReplyKind: kind, planReplyAt: new Date() },
    });
    revalidatePath("/");
    revalidatePath("/followups");
  } catch (err) {
    console.error("failed to record plan reply", err);
  }
}

// Resolve the patient a token/session may write for, and re-check the link
// version. Both carry {p, v}; a revoked link (linkVersion bumped) must not still
// be able to write, exactly as the read path rejects a stale token. Token or
// session only — never the clinic passcode, so one patient can't answer for
// another. Returns the patient id only when the version still matches.
async function authedPatientId(planToken?: string): Promise<string | null> {
  const ref = planToken
    ? await readPatientLink(planToken)
    : await readPatientSession();
  if (!ref) return null;
  const patient = await db.patient.findUnique({
    where: { id: ref.p },
    select: { linkVersion: true },
  });
  if (!patient || patient.linkVersion !== ref.v) return null;
  return ref.p;
}

// Patient-side: log a home reading. Writes Observation rows with
// source:"patient" so they show in the doctor's tagged "home readings" strip
// but never fuse into the clinical trend (memory.ts enforces that). Patient-
// authed by plan token or session, like recordPlanReply — never clinic-gated.
export async function recordHomeReading(
  key: string,
  values: Record<string, number>,
  planToken?: string,
): Promise<{ ok: true } | { error: string }> {
  const metric = HOME_METRICS.find((m) => m.key === key);
  if (!metric) return { error: "bad_metric" };

  const patientId = await authedPatientId(planToken);
  if (!patientId) return { error: "expired" };

  const rows = metric.fields.map((f) => ({
    type: f.type,
    value: Number(values[f.type]),
  }));
  // every field required (both BP numbers), sane range, no garbage
  if (
    rows.some(
      (r) => !Number.isFinite(r.value) || r.value <= 0 || r.value > 1000,
    )
  ) {
    return { error: "invalid" };
  }

  try {
    await db.observation.createMany({
      data: rows.map((r) => ({
        patientId,
        type: r.type,
        value: r.value,
        unit: metric.unit,
        measuredAt: new Date(),
        source: "patient",
      })),
    });
  } catch (err) {
    console.error("failed to record home reading", err);
    return { error: "failed" };
  }
  return { ok: true };
}

// ── Front-desk queue ────────────────────────────────────────────────────────
// Reachable by staff (queue-only session) OR the doctor. Never assertClinicSession.

export type CheckinVitals = {
  bpSys?: number | null;
  bpDia?: number | null;
  pulse?: number | null;
  weight?: number | null;
  tempF?: number | null;
};

// Keep only physiologically-sane readings — a fat-fingered "1400" for BP must
// never reach the chart or the trend. Anything out of range is dropped to null.
function saneVitals(v: CheckinVitals | undefined) {
  const clamp = (x: number | null | undefined, lo: number, hi: number) =>
    x != null && Number.isFinite(x) && x >= lo && x <= hi ? x : null;
  return {
    bpSys: clamp(v?.bpSys, 50, 300),
    bpDia: clamp(v?.bpDia, 30, 200),
    pulse: clamp(v?.pulse, 30, 250),
    weight: clamp(v?.weight, 1, 400),
    tempF: clamp(v?.tempF, 90, 115),
  };
}

export async function addToQueue(
  patientId: string,
  note?: string,
  vitals?: CheckinVitals,
) {
  await assertQueueAccess();
  if (liveClinicEnabled())
    throw new ClinicError(
      409,
      "refresh",
      "Refresh the front desk to use live check-in.",
    );
  if (!patientId) return;
  // Don't double-queue someone already waiting TODAY. Scoping to today matters:
  // yesterday's "seen"-that-never-happened or a stale waiting row must not block
  // today's check-in (and flash a false "added") when they walk back in.
  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);
  const v = saneVitals(vitals);
  const existing = await db.queueEntry.findFirst({
    where: { patientId, status: "waiting", arrivedAt: { gte: dayStart } },
  });
  if (existing) {
    // Already waiting — fold in any vitals or reason taken now, but never blank
    // out what's already there.
    const patch: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v)) if (val != null) patch[k] = val;
    if (note?.trim()) patch.note = note.trim();
    if (Object.keys(patch).length > 0) {
      await db.queueEntry.update({ where: { id: existing.id }, data: patch });
    }
  } else {
    await db.queueEntry.create({
      data: { patientId, note: note?.trim() || null, ...v },
    });
  }
  revalidatePath("/queue");
  revalidatePath("/");
}

export async function staffRegisterAndQueue(formData: FormData) {
  await assertQueueAccess();
  if (liveClinicEnabled())
    throw new ClinicError(
      409,
      "refresh",
      "Refresh the front desk to use live check-in.",
    );
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const phone = storablePhone(String(formData.get("phone") ?? ""));
  const note = String(formData.get("note") ?? "").trim() || null;
  // Capture the same identity fields the doctor's intake does, so a walk-in
  // registered at the front desk isn't a half-empty record — age and sex are
  // what every list shows under the name.
  const ageRaw = String(formData.get("age") ?? "").trim();
  const age = ageRaw ? parseInt(ageRaw, 10) : null;
  const sex = String(formData.get("sex") ?? "").trim() || null;
  const patient = await createPatientWithFileNumber({
    name,
    phone,
    ageYears: age != null && Number.isFinite(age) ? age : null,
    sex,
  });
  // Vitals are recorded against the waiting entry once the nurse takes them.
  await db.queueEntry.create({ data: { patientId: patient.id, note } });
  revalidatePath("/queue");
  revalidatePath("/");
}

// Vitals recorded against a patient who is already waiting — the nurse takes
// them while the patient waits for the doctor. They land on the doctor's chart
// (the "checked in" line) and pre-fill the visit form. Replaces the whole set
// (the editor sends every field), clamped to sane ranges.
export async function setQueueVitals(
  entryId: string,
  vitals: CheckinVitals,
  revision?: number,
) {
  await assertQueueAccess();
  if (!entryId) return;
  if (liveClinicEnabled()) {
    const safe = saneVitals(vitals);
    if (
      Object.entries(vitals).some(
        ([key, value]) =>
          value != null && safe[key as keyof typeof safe] === null,
      )
    )
      return {
        ok: false as const,
        error: "Check the vital measurements before saving.",
      };
    try {
      await db.$transaction(async (tx) => {
        await lockClinic(tx);
        const entry = await tx.queueEntry.findUnique({
          where: { id: entryId },
          select: {
            status: true,
            revision: true,
            dayKey: true,
            arrivedAt: true,
          },
        });
        if (
          entry?.status !== "waiting" ||
          revision !== entry.revision ||
          (entry.dayKey !== clinicDay() && entry.arrivedAt < clinicDayStart())
        )
          throw new Error("not_waiting");
        await tx.queueEntry.update({
          where: { id: entryId },
          data: { ...safe, revision: { increment: 1 } },
        });
        await touchClinic(tx);
      });
      revalidatePath("/");
      revalidatePath("/queue");
      return { ok: true as const };
    } catch {
      return {
        ok: false as const,
        error:
          "Could not save. Check that the patient is still waiting, then try again.",
      };
    }
  }
  await db.queueEntry
    .update({ where: { id: entryId }, data: saneVitals(vitals) })
    .catch(() => {});
  revalidatePath("/queue");
  revalidatePath("/");
}

export async function removeFromQueue(entryId: string) {
  await assertQueueAccess();
  if (liveClinicEnabled())
    throw new ClinicError(
      409,
      "refresh",
      "Refresh the live queue before removing an arrival.",
    );
  if (!entryId) return;
  await db.queueEntry.delete({ where: { id: entryId } }).catch(() => {});
  revalidatePath("/queue");
  revalidatePath("/");
}

export async function markQueueSeen(entryId: string) {
  await assertQueueAccess();
  if (liveClinicEnabled())
    throw new ClinicError(
      409,
      "refresh",
      "Complete the consultation through the doctor visit form.",
    );
  if (!entryId) return;
  await db.queueEntry
    .update({
      where: { id: entryId },
      data: { status: "seen", seenAt: new Date() },
    })
    .catch(() => {});
  revalidatePath("/");
  revalidatePath("/queue");
}

// Staff-safe lookup for the queue: enough to find and identify a patient
// (name, file no., phone, age/sex) but NO clinical data — no conditions, no
// last visit. The front desk sees who, never why.
export async function searchPatientsForQueue(q: string) {
  await assertQueueAccess();
  const query = q.trim();
  if (!query) return [];
  // A file number is a small int; a phone-length number overflows Postgres int4
  // and makes the whole query throw "out of range for integer" — which is why
  // searching by phone used to fail intermittently. Only match a file number
  // when the value actually fits one.
  const asNumber = Number(query);
  const asFileNumber =
    Number.isInteger(asNumber) && asNumber > 0 && asNumber <= 2147483647
      ? asNumber
      : null;
  // Match phones on digits alone, so "+91 98765-43101" finds a stored 9876543101.
  const digits = phoneQuery(query);
  return db.patient.findMany({
    where: {
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        ...(digits ? [{ phone: { contains: digits } }] : []),
        ...(asFileNumber !== null ? [{ fileNumber: asFileNumber }] : []),
      ],
    },
    select: {
      id: true,
      name: true,
      fileNumber: true,
      phone: true,
      ageYears: true,
      sex: true,
    },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });
}

export async function staffSignOut() {
  await clearStaffSession();
  // Back to the reception door (not the doctor's), so the wording and the
  // passcode it expects stay right for whoever signs back in at the desk.
  redirect("/login?desk=1");
}

export async function completeTask(taskId: string) {
  await assertClinicSession();
  const task = await db.carePlanTask.update({
    where: { id: taskId },
    data: { status: "done", completedAt: new Date() },
  });
  revalidatePath("/followups");
  revalidatePath(`/patients/${task.patientId}`);
  revalidatePath("/");
}

// Per-patient link revocation. Bumping linkVersion invalidates every plan token
// already sent to this patient (they were minted at the old version); the next
// share mints a fresh one at the new version. This is the doctor's remedy when
// a link reached the wrong number — no secret rotation, nobody else affected.
export async function resetPatientLinks(patientId: string) {
  await assertClinicSession();
  if (!patientId) return;
  await db.patient.update({
    where: { id: patientId },
    data: { linkVersion: { increment: 1 } },
  });
  revalidatePath(`/patients/${patientId}`);
}

// ── Google identity for patients ────────────────────────────────────────────

// Step 1 of "sign in with Google". Which patient this is for is derived
// SERVER-SIDE from the plan token the caller holds — never from an argument
// naming a patient (a client that could name a patientId could bind its Google
// account to a stranger). The result is a bind cookie, not a query param: a
// token in a URL ends up in provider logs and Referer headers. Returns the
// Google URL for the client to navigate to (on the server signInWithOAuth does
// not redirect, it hands back the URL). No plan token → a plain return-login.
export async function startPatientGoogleAuth(
  planToken?: string,
): Promise<{ url: string } | { error: string }> {
  let bind: string | null = null;
  if (planToken) {
    const link = await readPatientLink(planToken);
    if (link) {
      const p = await db.patient.findUnique({
        where: { id: link.p },
        select: { linkVersion: true },
      });
      if (p && p.linkVersion === link.v)
        bind = await createBindToken(link.p, link.v);
    }
    if (!bind) return { error: "expired" }; // fail closed on a stale link
  }

  const { supabase } = await supabaseForAuth();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${siteUrl()}/auth/callback`,
      // Always show the account picker — on a shared family phone the signed-in
      // account must never be reused silently.
      queryParams: { prompt: "select_account" },
    },
  });
  if (error || !data?.url) return { error: "unavailable" };

  if (bind) {
    const jar = await cookies();
    jar.set("medspace_bind", bind, {
      httpOnly: true,
      sameSite: "lax", // the return from accounts.google.com is cross-site; strict would drop it
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
  }
  return { url: data.url };
}

// The chooser's action: a Google account bound to several patients picks one.
// Re-verified server-side — the id must be in OUR signed list AND still have an
// active binding — so a tampered form can't open an unrelated record.
export async function selectPatientForSession(patientId: string) {
  const jar = await cookies();
  const chooser = await readChooserToken(
    jar.get("medspace_choose")?.value ?? "",
  );
  if (!chooser || !chooser.ids.includes(patientId))
    redirect("/welcome/patient?e=nolink");
  if (!(await hasActiveAccess(chooser!.s, patientId)))
    redirect("/welcome/patient?e=nolink");

  const patient = await db.patient.findUnique({
    where: { id: patientId },
    select: { linkVersion: true },
  });
  if (!patient) redirect("/welcome/patient?e=nolink");

  await setPatientSession(patientId, patient!.linkVersion);
  await db.patientAccess
    .update({
      where: {
        provider_providerUserId_patientId: {
          provider: "google",
          providerUserId: chooser!.s,
          patientId,
        },
      },
      data: { lastUsedAt: new Date() },
    })
    .catch(() => {});
  jar.delete("medspace_choose");
  redirect("/plan");
}

export async function patientSignOut() {
  await clearPatientSession();
  redirect("/welcome/patient");
}

// Doctor-side, on the chart: promote a pending binding to active (this is the
// authorization that lets the Google account open the record on return) …
export async function confirmPatientBinding(accessId: string) {
  await assertClinicSession();
  if (!accessId) return;
  const row = await db.patientAccess.update({
    where: { id: accessId },
    data: { status: "active", confirmedAt: new Date() },
  });
  revalidatePath(`/patients/${row.patientId}`);
}

// … or remove one. Also bumps linkVersion so any live session that binding
// produced is cut immediately (the session is self-contained {p,v}); the doctor
// re-sends the link afterwards, which costs nothing.
export async function removePatientBinding(accessId: string) {
  await assertClinicSession();
  if (!accessId) return;
  const row = await db.patientAccess.delete({ where: { id: accessId } });
  await db.patient.update({
    where: { id: row.patientId },
    data: { linkVersion: { increment: 1 } },
  });
  revalidatePath(`/patients/${row.patientId}`);
}
