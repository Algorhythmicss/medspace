import { db } from "@/lib/db";
import { careContentVersion } from "@/lib/live-content";
import { CARE_PATIENT_BYTES } from "@/lib/care-media";
import {
  ClinicError,
  commandId,
  recordId,
  type ClinicActor,
  type ClinicSnapshot,
} from "@/lib/live-clinic";
import {
  clinicCommand,
  liveSnapshot,
  mediaProjection,
  mediaSelection,
  type ClinicTx,
} from "@/lib/live-clinic-server";

export async function assertMediaAllowance(
  tx: ClinicTx,
  patientId: string,
  bytes: number,
) {
  const stored = await tx.careMedia.aggregate({
    where: { patientId },
    _sum: { size: true },
  });
  if ((stored._sum.size ?? 0) + bytes > CARE_PATIENT_BYTES)
    throw new ClinicError(
      413,
      "media_allowance",
      "The private media allowance is full. Please contact the clinic before adding more files.",
    );
}
export async function doctorPatientSnapshot(
  patientId: string,
): Promise<ClinicSnapshot> {
  const [snapshot, patient] = await Promise.all([
    liveSnapshot({ kind: "doctor" }),
    db.patient.findUnique({
      where: { id: patientId },
      select: {
        name: true,
        progressPhotoRequests: {
          orderBy: { createdAt: "desc" },
          take: 12,
          select: {
            id: true,
            taskId: true,
            instructions: true,
            status: true,
            maximumPhotos: true,
            task: { select: { dueDate: true, status: true } },
            files: { select: mediaSelection, orderBy: { createdAt: "asc" } },
          },
        },
        careMedia: {
          where: { kind: "doctor_audio", sharedAt: { not: null } },
          select: mediaSelection,
          orderBy: { createdAt: "desc" },
          take: 10,
        },
        tasks: {
          where: { kind: "FOLLOW_UP", status: "pending" },
          select: { id: true, title: true, dueDate: true },
          orderBy: { dueDate: "asc" },
          take: 10,
        },
      },
    }),
  ]);
  if (!patient)
    throw new ClinicError(404, "patient_missing", "Patient not found.");
  return {
    ...snapshot,
    contentVersion: await careContentVersion(db, patientId),
    care: {
      patientId,
      patientName: patient.name,
      photoRequests: patient.progressPhotoRequests.map((request) => ({
        id: request.id,
        taskId: request.taskId,
        instructions: request.instructions,
        maximumPhotos: request.maximumPhotos,
        status:
          request.status === "open" && request.task?.status === "pending"
            ? "open"
            : "closed",
        dueAt: request.task?.dueDate?.toISOString() ?? null,
        files: request.files.map(mediaProjection),
      })),
      messages: patient.careMedia.map(mediaProjection),
      followups: patient.tasks.map((task) => ({
        id: task.id,
        title: task.title,
        dueAt: task.dueDate?.toISOString() ?? null,
      })),
    },
  };
}
export async function doctorCareMutation(
  actor: ClinicActor,
  patientId: string,
  body: Record<string, unknown>,
) {
  if (actor.kind !== "doctor")
    throw new ClinicError(
      403,
      "role",
      "Only the doctor can review or request photos.",
    );
  const id = commandId(body.commandId),
    kind = String(body.kind || "");
  if (
    Object.keys(body).some(
      (key) =>
        ![
          "commandId",
          "kind",
          "taskId",
          "requestId",
          "mediaId",
          "instructions",
        ].includes(key),
    )
  )
    throw new ClinicError(
      400,
      "fields",
      "The request contains an unexpected field.",
    );
  if (!["assign_photos", "close_photos", "review_photo"].includes(kind))
    throw new ClinicError(400, "operation", "Choose a valid care action.");
  return clinicCommand(actor, id, kind, { patientId, ...body }, async (tx) => {
    if (kind === "assign_photos") {
      const task = await tx.carePlanTask.findFirst({
        where: {
          id: recordId(body.taskId),
          patientId,
          kind: "FOLLOW_UP",
          status: "pending",
        },
        select: { id: true },
      });
      const instructions =
        typeof body.instructions === "string" ? body.instructions.trim() : "";
      if (!task)
        throw new ClinicError(
          409,
          "followup",
          "Choose an active follow-up before requesting progress photos.",
        );
      if (!instructions || instructions.length > 500)
        throw new ClinicError(
          400,
          "instructions",
          "Add brief photo instructions (up to 500 characters).",
        );
      const existing = await tx.progressPhotoRequest.findUnique({
        where: { taskId: task.id },
      });
      if (existing)
        throw new ClinicError(
          409,
          "photo_request_exists",
          "This follow-up already has a photo request. Review its existing photos below.",
        );
      const request = await tx.progressPhotoRequest.create({
        data: { patientId, taskId: task.id, instructions },
      });
      return { requestId: request.id };
    }
    if (kind === "close_photos") {
      const request = await tx.progressPhotoRequest.findFirst({
        where: { id: recordId(body.requestId), patientId },
        select: { id: true },
      });
      if (!request)
        throw new ClinicError(
          404,
          "request_missing",
          "Photo request not found.",
        );
      await tx.progressPhotoRequest.update({
        where: { id: request.id },
        data: { status: "closed", closedAt: new Date() },
      });
      return { requestId: request.id };
    }
    const photo = await tx.careMedia.findFirst({
      where: { id: recordId(body.mediaId), patientId, kind: "progress_photo" },
      select: { id: true },
    });
    if (!photo) throw new ClinicError(404, "photo_missing", "Photo not found.");
    await tx.careMedia.updateMany({
      where: { id: photo.id, reviewedAt: null },
      data: { reviewedAt: new Date() },
    });
    return { mediaId: photo.id };
  });
}
