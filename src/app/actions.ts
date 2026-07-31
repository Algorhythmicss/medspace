"use server";

import { db } from "@/lib/db";
import { supersedeStaleLabTasks } from "@/lib/tasks";
import { saveReport, MAX_FILE_BYTES } from "@/lib/reports";
import { mergePatients } from "@/lib/merge";
import { sessionCookieName } from "@/lib/auth";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type RxItemInput = {
  drugName: string;
  frequency: string;
  duration?: string;
  instructions?: string;
};

export type NewVisitInput = {
  patientId: string;
  complaint?: string;
  diagnosis?: string;
  vitals?: { bpSys?: number; bpDia?: number; pulse?: number; weight?: number };
  items: RxItemInput[];
  advice?: string;
  followUpInDays?: number;
  labTasks: string[]; // e.g. ["HbA1c", "Lipid profile"]
};

export async function createVisit(input: NewVisitInput) {
  const now = new Date();
  const followUpDate = input.followUpInDays
    ? new Date(now.getTime() + input.followUpInDays * 86400000)
    : null;

  const visit = await db.visit.create({
    data: {
      patientId: input.patientId,
      visitDate: now,
      complaint: input.complaint || null,
      diagnosis: input.diagnosis || null,
      followUpDate,
      prescription:
        input.items.length > 0 || input.advice
          ? {
              create: {
                advice: input.advice || null,
                items: {
                  create: input.items.map((item, i) => ({
                    sortOrder: i,
                    drugName: item.drugName,
                    frequency: item.frequency || "OD",
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
  if (input.vitals?.bpSys) obs.push({ type: "BP_SYS", value: input.vitals.bpSys, unit: "mmHg" });
  if (input.vitals?.bpDia) obs.push({ type: "BP_DIA", value: input.vitals.bpDia, unit: "mmHg" });
  if (input.vitals?.pulse) obs.push({ type: "PULSE", value: input.vitals.pulse, unit: "bpm" });
  if (input.vitals?.weight) obs.push({ type: "WEIGHT", value: input.vitals.weight, unit: "kg" });
  if (obs.length > 0) {
    await db.observation.createMany({
      data: obs.map((o) => ({ ...o, patientId: input.patientId, visitId: visit.id, measuredAt: now })),
    });
  }

  const tasks: Array<{ kind: string; title: string; dueDate: Date | null }> = [];
  if (followUpDate) {
    tasks.push({ kind: "FOLLOW_UP", title: input.diagnosis ? `Review: ${input.diagnosis}` : "Follow-up visit", dueDate: followUpDate });
  }
  for (const lab of input.labTasks) {
    // labs should be back before the follow-up
    const labDue = followUpDate
      ? new Date(followUpDate.getTime() - 7 * 86400000)
      : new Date(now.getTime() + 14 * 86400000);
    tasks.push({ kind: "LAB_TEST", title: lab, dueDate: labDue < now ? followUpDate : labDue });
  }
  if (tasks.length > 0) {
    await db.carePlanTask.createMany({
      data: tasks.map((t) => ({ ...t, patientId: input.patientId, visitId: visit.id, status: "pending" })),
    });
  }

  // a fresh lab order supersedes overlapping older pending ones
  await supersedeStaleLabTasks(input.patientId, input.labTasks, visit.id);

  // close out any previously pending follow-up tasks — the patient showed up
  await db.carePlanTask.updateMany({
    where: {
      patientId: input.patientId,
      status: "pending",
      kind: "FOLLOW_UP",
      visitId: { not: visit.id },
    },
    data: { status: "done", completedAt: now },
  });

  // touch patient so they surface in "recent"; bump drug usage for autosuggest learning
  await db.patient.update({ where: { id: input.patientId }, data: { updatedAt: now } });
  for (const item of input.items) {
    await db.drug.updateMany({
      where: { name: item.drugName },
      data: { useCount: { increment: 1 } },
    });
  }

  revalidatePath(`/patients/${input.patientId}`);
  revalidatePath("/");
  revalidatePath("/followups");
  redirect(`/visits/${visit.id}/rx`);
}

export async function createPatient(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const phone = String(formData.get("phone") ?? "").trim() || null;
  const ageRaw = String(formData.get("age") ?? "").trim();
  const sex = String(formData.get("sex") ?? "").trim() || null;

  const maxFile = await db.patient.aggregate({ _max: { fileNumber: true } });
  const patient = await db.patient.create({
    data: {
      fileNumber: (maxFile._max.fileNumber ?? 100) + 1,
      name,
      phone,
      sex,
      ageYears: ageRaw ? parseInt(ageRaw, 10) : null,
    },
  });
  revalidatePath("/");
  redirect(`/patients/${patient.id}`);
}

export async function createReport(formData: FormData) {
  const patientId = String(formData.get("patientId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!patientId || !title) return;

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
  let file: { name: string; mime: string; bytes: Uint8Array<ArrayBuffer> } | null = null;
  if (fileEntry instanceof File && fileEntry.size > 0) {
    if (fileEntry.size > MAX_FILE_BYTES) return;
    file = {
      name: fileEntry.name,
      mime: fileEntry.type || "application/octet-stream",
      bytes: new Uint8Array(await fileEntry.arrayBuffer()),
    };
  }

  await saveReport({
    patientId,
    title,
    kind,
    reportDate: dateRaw ? new Date(dateRaw) : new Date(),
    summary: summary || undefined,
    values,
    file,
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
  redirect(`/patients/${patientId}`);
}

export async function updatePatient(formData: FormData) {
  const patientId = String(formData.get("patientId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!patientId || !name) return;

  const ageRaw = String(formData.get("age") ?? "").trim();
  const age = ageRaw ? parseInt(ageRaw, 10) : null;

  await db.patient.update({
    where: { id: patientId },
    data: {
      name,
      phone: String(formData.get("phone") ?? "").trim() || null,
      sex: String(formData.get("sex") ?? "").trim() || null,
      ageYears: age != null && Number.isFinite(age) ? age : null,
      address: String(formData.get("address") ?? "").trim() || null,
      abhaId: String(formData.get("abhaId") ?? "").trim() || null,
    },
  });

  revalidatePath(`/patients/${patientId}`);
  revalidatePath("/");
  redirect(`/patients/${patientId}`);
}

export async function mergePatientRecords(formData: FormData) {
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

export async function completeTask(taskId: string) {
  const task = await db.carePlanTask.update({
    where: { id: taskId },
    data: { status: "done", completedAt: new Date() },
  });
  revalidatePath("/followups");
  revalidatePath(`/patients/${task.patientId}`);
}
