"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { assertClinicSession } from "@/lib/session";
import { assessmentEnabled, recordAssessmentScan } from "@/lib/assessment-server";
import { scanAssessmentBytes } from "@/lib/assessment-scanner";

export async function reviewInitialAssessment(form: FormData): Promise<void> {
  await assertClinicSession();
  if (!assessmentEnabled()) return;
  const id = form.get("assessmentId");
  const decision = form.get("decision");
  if (typeof id !== "string" || !/^[a-z0-9]{20,32}$/.test(id) || (decision !== "reviewed" && decision !== "dismissed")) return;
  const assessment = await db.initialAssessment.findUnique({ where: { id }, select: { patientId: true } });
  if (!assessment) return;
  await db.initialAssessment.updateMany({ where: { id, status: "pending" }, data: { status: decision, reviewedAt: new Date() } });
  revalidatePath("/");
  revalidatePath(`/patients/${assessment.patientId}`);
  revalidatePath("/plan");
}

export async function rescanAssessmentFile(_previous: { message: string }, form: FormData): Promise<{ message: string }> {
  await assertClinicSession();
  if (!assessmentEnabled()) return { message: "Assessment uploads are unavailable." };
  const id = form.get("fileId");
  if (typeof id !== "string" || !/^[a-z0-9]{20,32}$/.test(id)) return { message: "File not found." };
  const file = await db.assessmentFile.findFirst({
    where: { id, scanStatus: "quarantined" },
    select: { data: true, assessment: { select: { patientId: true } } },
  });
  if (!file) return { message: "This file is no longer waiting for a scan. Refresh the page." };
  const verdict = await scanAssessmentBytes(file.data);
  if (verdict === "unavailable") return { message: "The private malware scanner is unavailable. This file remains quarantined and cannot be downloaded." };
  const result = await recordAssessmentScan(id, verdict);
  revalidatePath(`/patients/${file.assessment.patientId}`);
  revalidatePath("/plan");
  return { message: result?.scanStatus === "clean" ? "Malware scan passed. The file is available as a download." : "The file failed its safety scan or changed during review and remains blocked." };
}
