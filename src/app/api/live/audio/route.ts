import { assertAssessmentOrigin } from "@/lib/assessment-server";
import { hasClinicSession } from "@/lib/session";
import { boundedCareForm, doctorAudio, formFields } from "@/lib/care-media";
import { ClinicError, commandId, recordId } from "@/lib/live-clinic";
import { clinicCommand, liveClinicEnabled } from "@/lib/live-clinic-server";
import {
  assertMediaAllowance,
  doctorPatientSnapshot,
} from "@/lib/live-care-server";
import { liveFailure, liveJson } from "@/lib/live-http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    if (!liveClinicEnabled())
      throw new ClinicError(404, "missing", "Not found");
    assertAssessmentOrigin(request);
    if (!(await hasClinicSession()))
      throw new ClinicError(
        403,
        "role",
        "Only the doctor can share a voice message.",
      );
    const form = await boundedCareForm(request);
    formFields(form, [
      "commandId",
      "patientId",
      "durationMs",
      "share",
      "files",
    ]);
    const id = commandId(form.get("commandId")),
      patientId = recordId(form.get("patientId")),
      durationMs = Number(form.get("durationMs"));
    if (
      form.get("share") !== "yes" ||
      form.getAll("files").length !== 1 ||
      !(form.get("files") instanceof File)
    )
      throw new ClinicError(
        400,
        "share",
        "Preview your recording and choose Share with patient.",
      );
    const prepared = await doctorAudio(form.get("files") as File, durationMs);
    const result = await clinicCommand(
      { kind: "doctor" },
      id,
      "share_audio",
      { patientId, hash: prepared.hash, durationMs: prepared.durationMs },
      async (tx) => {
        if (
          !(await tx.patient.findUnique({
            where: { id: patientId },
            select: { id: true },
          }))
        )
          throw new ClinicError(404, "missing", "Patient not found.");
        const active = await tx.queueEntry.findFirst({
          where: { status: { in: ["called", "in_consultation"] } },
          select: { id: true, patientId: true },
        });
        if (active && active.patientId !== patientId)
          throw new ClinicError(
            409,
            "wrong_patient",
            "A different patient is with the doctor. Check the patient file before sharing.",
          );
        if (
          (await tx.careMedia.count({
            where: {
              patientId,
              kind: "doctor_audio",
              createdAt: { gte: new Date(Date.now() - 86400000) },
            },
          })) >= 6
        )
          throw new ClinicError(
            429,
            "audio_limit",
            "Six messages have already been shared for this patient today.",
          );
        await assertMediaAllowance(tx, patientId, prepared.size);
        const media = await tx.careMedia.create({
          data: {
            patientId,
            queueEntryId: active?.id,
            kind: "doctor_audio",
            name: prepared.name,
            mime: prepared.mime,
            size: prepared.size,
            sha256: prepared.hash,
            data: prepared.data,
            durationMs: prepared.durationMs,
            sharedAt: new Date(),
          },
        });
        return { mediaId: media.id };
      },
    );
    return liveJson(
      { ok: true, result, snapshot: await doctorPatientSnapshot(patientId) },
      201,
    );
  } catch (error) {
    return liveFailure(error);
  }
}
