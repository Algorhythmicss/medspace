import {
  assertAssessmentOrigin,
  reserveAssessmentAttempt,
} from "@/lib/assessment-server";
import { boundedCareForm, formFields, progressPhotos } from "@/lib/care-media";
import { ClinicError, commandId, recordId } from "@/lib/live-clinic";
import {
  clinicCommand,
  liveClinicEnabled,
  liveSnapshot,
  patientActor,
} from "@/lib/live-clinic-server";
import { assertMediaAllowance } from "@/lib/live-care-server";
import { db } from "@/lib/db";
import { liveFailure, liveJson } from "@/lib/live-http";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    if (!liveClinicEnabled())
      throw new ClinicError(404, "missing", "Not found");
    assertAssessmentOrigin(request);
    const actor = await patientActor(request);
    if (!actor)
      throw new ClinicError(
        401,
        "expired",
        "Your care link has expired. Ask the clinic for a new one.",
      );
    await reserveAssessmentAttempt({ p: actor.patientId, v: actor.version });
    const form = await boundedCareForm(request);
    formFields(form, ["requestId", "commandId", "consent", "files"]);
    const id = commandId(form.get("commandId")),
      requestId = recordId(form.get("requestId"));
    if (form.get("consent") !== "yes")
      throw new ClinicError(
        400,
        "consent",
        "Confirm these are your progress photos and you want the doctor to review them.",
      );
    if (
      !(await db.progressPhotoRequest.findFirst({
        where: { id: requestId, patientId: actor.patientId },
        select: { id: true },
      }))
    )
      throw new ClinicError(404, "missing", "Photo request not found.");
    const prepared = await progressPhotos(form);
    const result = await clinicCommand(
      actor,
      id,
      "progress_photos",
      { requestId, hash: prepared.hash },
      async (tx) => {
        const assigned = await tx.progressPhotoRequest.findFirst({
          where: {
            id: requestId,
            patientId: actor.patientId,
            status: "open",
            task: {
              status: "pending",
              kind: "FOLLOW_UP",
              patientId: actor.patientId,
            },
          },
          select: { maximumPhotos: true, _count: { select: { files: true } } },
        });
        if (!assigned)
          throw new ClinicError(
            409,
            "closed",
            "The doctor is no longer collecting photos for this follow-up.",
          );
        const prior = await tx.careMedia.findMany({
            where: { requestId, patientId: actor.patientId },
            select: { id: true, sha256: true },
          }),
          seen = new Set(prior.map((file) => file.sha256));
        const fresh = prepared.files.filter((file) => {
          if (seen.has(file.sha256)) return false;
          seen.add(file.sha256);
          return true;
        });
        if (assigned._count.files + fresh.length > assigned.maximumPhotos)
          throw new ClinicError(
            409,
            "photo_limit",
            `This follow-up allows ${assigned.maximumPhotos} photos in total. Your earlier photos are already saved.`,
          );
        await assertMediaAllowance(
          tx,
          actor.patientId,
          fresh.reduce((sum, file) => sum + file.size, 0),
        );
        const ids: string[] = [];
        for (const file of fresh) {
          const created = await tx.careMedia.create({
            data: {
              ...file,
              patientId: actor.patientId,
              requestId,
              kind: "progress_photo",
            },
          });
          ids.push(created.id);
        }
        return {
          mediaIds: ids,
          duplicatesSkipped: prepared.files.length - fresh.length,
        };
      },
    );
    return liveJson(
      { ok: true, result, snapshot: await liveSnapshot(actor) },
      201,
    );
  } catch (error) {
    return liveFailure(error);
  }
}
