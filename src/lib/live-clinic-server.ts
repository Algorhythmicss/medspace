import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { hasClinicSession, hasStaffSession } from "@/lib/session";
import { assessmentPatient } from "@/lib/assessment-server";
import { storablePhone } from "@/lib/phone";
import { careContentVersion } from "@/lib/live-content";
import {
  ACTIVE_QUEUE,
  ClinicError,
  clinicDay,
  clinicDayStart,
  commandId,
  isDoctorSlot,
  patientQueue,
  queueOrder,
  recordId,
  type ClinicActor,
  type ClinicSnapshot,
  type MediaItem,
  type QueueItem,
  type QueueStatus,
} from "@/lib/live-clinic";

export type ClinicTx = Prisma.TransactionClient;
export function liveClinicEnabled() {
  return process.env.MEDSPACE_LIVE_CLINIC_ENABLED === "true";
}
export async function patientActor(
  request: Request,
): Promise<Extract<ClinicActor, { kind: "patient" }> | null> {
  const patient = await assessmentPatient(request);
  return patient
    ? { kind: "patient", patientId: patient.p, version: patient.v }
    : null;
}
export async function liveActor(
  request?: Request,
): Promise<ClinicActor | null> {
  if (await hasClinicSession()) return { kind: "doctor" };
  if (await hasStaffSession()) return { kind: "staff" };
  if (request) {
    const patient = await patientActor(request);
    if (patient) return patient;
  }
  return null;
}
export async function lockClinic(tx: ClinicTx) {
  const clinic = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT id FROM "Clinic" WHERE id='clinic' FOR UPDATE`;
  if (!clinic.length)
    throw new ClinicError(
      409,
      "clinic_setup",
      "The doctor needs to complete clinic setup first.",
    );
  await tx.clinicLiveSettings.upsert({
    where: { id: "clinic" },
    create: { id: "clinic" },
    update: {},
  });
}
export async function touchClinic(tx: ClinicTx) {
  await tx.clinicLiveSettings.update({
    where: { id: "clinic" },
    data: { revision: { increment: 1 } },
  });
}
export function actorKey(actor: ClinicActor) {
  return actor.kind === "patient" ? `patient:${actor.patientId}` : actor.kind;
}
export function payloadHash(value: unknown) {
  return createHash("sha256")
    .update(
      JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.fromEntries(
              Object.keys(item)
                .sort()
                .map((key) => [key, item[key]]),
            )
          : item,
      ),
    )
    .digest("hex");
}
export async function clinicCommand<T extends Prisma.InputJsonValue>(
  actor: ClinicActor,
  id: string,
  kind: string,
  payload: unknown,
  run: (tx: ClinicTx) => Promise<T>,
): Promise<T> {
  commandId(id);
  const hash = payloadHash(payload);
  return db.$transaction(
    async (tx) => {
      await lockClinic(tx);
      if (actor.kind === "patient") {
        const rows = await tx.$queryRaw<
          Array<{ linkVersion: number }>
        >`SELECT "linkVersion" FROM "Patient" WHERE id=${actor.patientId} FOR UPDATE`;
        if (!rows.length || rows[0].linkVersion !== actor.version)
          throw new ClinicError(
            401,
            "expired",
            "Your care link has expired. Ask the clinic for a new link.",
          );
      }
      const previous = await tx.liveCommandReceipt.findUnique({
        where: { id },
      });
      if (previous) {
        if (
          previous.actor !== actorKey(actor) ||
          previous.kind !== kind ||
          previous.payloadHash !== hash
        )
          throw new ClinicError(
            409,
            "command_conflict",
            "This retry changed. Refresh and check the saved state before continuing.",
          );
        return previous.result as T;
      }
      const result = await run(tx);
      await tx.liveCommandReceipt.create({
        data: { id, actor: actorKey(actor), kind, payloadHash: hash, result },
      });
      await touchClinic(tx);
      return result;
    },
    { maxWait: 10000, timeout: 15000 },
  );
}
export const mediaSelection = {
  id: true,
  kind: true,
  name: true,
  mime: true,
  size: true,
  durationMs: true,
  createdAt: true,
  reviewedAt: true,
  sharedAt: true,
} as const;
export function mediaProjection(value: {
  id: string;
  kind: string;
  name: string;
  mime: string;
  size: number;
  durationMs: number | null;
  createdAt: Date;
  reviewedAt: Date | null;
  sharedAt: Date | null;
}): MediaItem {
  return {
    ...value,
    kind: value.kind as MediaItem["kind"],
    createdAt: value.createdAt.toISOString(),
    reviewedAt: value.reviewedAt?.toISOString() ?? null,
    sharedAt: value.sharedAt?.toISOString() ?? null,
  };
}
function activeWhere(now = new Date()): Prisma.QueueEntryWhereInput {
  return {
    OR: [
      { dayKey: clinicDay(now), status: { in: [...ACTIVE_QUEUE] } },
      {
        dayKey: null,
        arrivedAt: { gte: clinicDayStart(now) },
        status: "waiting",
      },
      { status: { in: ["called", "in_consultation"] } },
    ],
  };
}
export async function liveSnapshot(
  actor: ClinicActor,
): Promise<ClinicSnapshot> {
  return db.$transaction(
    async (tx) => {
      const now = new Date();
      const [settings, rows] = await Promise.all([
        tx.clinicLiveSettings.findUnique({ where: { id: "clinic" } }),
        tx.queueEntry.findMany({
          where: activeWhere(now),
          orderBy: [{ queuedAt: "asc" }, { id: "asc" }],
          take: 501,
          select: {
            id: true,
            patientId: true,
            status: true,
            dayKey: true,
            number: true,
            arrivedAt: true,
            queuedAt: true,
            calledAt: true,
            startedAt: true,
            revision: true,
            bpSys: true,
            bpDia: true,
            pulse: true,
            weight: true,
            tempF: true,
            patient: {
              select: {
                name: true,
                fileNumber: true,
                ageYears: true,
                sex: true,
                ...(actor.kind === "doctor"
                  ? {
                      _count: {
                        select: {
                          initialAssessments: { where: { status: "pending" } },
                          careMedia: {
                            where: { kind: "progress_photo", reviewedAt: null },
                          },
                        },
                      },
                    }
                  : {}),
              },
            },
          },
        }),
      ]);
      if (rows.length > 500)
        throw new ClinicError(
          503,
          "queue_limit",
          "The queue cannot be loaded safely. Please contact the clinic.",
        );
      const entries = queueOrder(
        rows.map((row) => ({
          id: row.id,
          patientId: row.patientId,
          name: row.patient.name,
          fileNumber: row.patient.fileNumber,
          ageYears: row.patient.ageYears,
          sex: row.patient.sex,
          number: row.number,
          dayKey: row.dayKey,
          status: row.status as QueueStatus,
          arrivedAt: row.arrivedAt.toISOString(),
          queuedAt: row.queuedAt.toISOString(),
          calledAt: row.calledAt?.toISOString() ?? null,
          startedAt: row.startedAt?.toISOString() ?? null,
          revision: row.revision,
          vitalsReady: [
            row.bpSys,
            row.bpDia,
            row.pulse,
            row.weight,
            row.tempF,
          ].some((value) => value !== null),
          vitals: {
            bpSys: row.bpSys,
            bpDia: row.bpDia,
            pulse: row.pulse,
            weight: row.weight,
            tempF: row.tempF,
          },
          ...(actor.kind === "doctor"
            ? {
                assessmentsToReview:
                  row.patient._count?.initialAssessments ?? 0,
                photosToReview: row.patient._count?.careMedia ?? 0,
              }
            : {}),
        })),
      );
      const base = {
        role: actor.kind,
        revision: settings?.revision ?? 0,
        serverTime: now.toISOString(),
        dayKey: clinicDay(now),
        settings: {
          averageMinutes: settings?.averageMinutes ?? null,
          paused: settings?.paused ?? false,
        },
      };
      if (actor.kind !== "patient") return { ...base, entries };
      const patient = await tx.patient.findUnique({
        where: { id: actor.patientId },
        select: { linkVersion: true },
      });
      if (!patient || patient.linkVersion !== actor.version)
        throw new ClinicError(
          401,
          "expired",
          "Your care link has expired. Ask the clinic for a new link.",
        );
      let own =
        entries.find((entry) => entry.patientId === actor.patientId) ?? null;
      if (!own) {
        const recent = await tx.queueEntry.findFirst({
          where: {
            patientId: actor.patientId,
            OR: [
              { dayKey: clinicDay(now) },
              { arrivedAt: { gte: clinicDayStart(now) } },
            ],
          },
          orderBy: { arrivedAt: "desc" },
          select: { id: true, number: true, dayKey: true, status: true },
        });
        if (recent) own = { ...recent } as QueueItem;
      }
      const [requests, messages] = await Promise.all([
        tx.progressPhotoRequest.findMany({
          where: { patientId: actor.patientId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            taskId: true,
            instructions: true,
            maximumPhotos: true,
            status: true,
            task: { select: { dueDate: true, status: true } },
            files: { orderBy: { createdAt: "asc" }, select: mediaSelection },
          },
        }),
        tx.careMedia.findMany({
          where: {
            patientId: actor.patientId,
            kind: "doctor_audio",
            sharedAt: { not: null },
          },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: mediaSelection,
        }),
      ]);
      return {
        ...base,
        patientQueue: patientQueue(entries, own, base.settings, now),
        contentVersion: await careContentVersion(tx, actor.patientId),
        photoRequests: requests.map((request) => ({
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
        messages: messages.map(mediaProjection),
      };
    },
    { isolationLevel: "RepeatableRead", timeout: 10000 },
  );
}

function short(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
export async function checkIn(tx: ClinicTx, patientId: string, note = "") {
  recordId(patientId);
  const now = new Date(),
    dayKey = clinicDay(now);
  const patient = await tx.patient.findUnique({
    where: { id: patientId },
    select: { id: true },
  });
  if (!patient)
    throw new ClinicError(404, "patient_missing", "Patient not found.");
  const existing =
    (await tx.queueEntry.findFirst({
      where: { patientId, status: { in: ["called", "in_consultation"] } },
    })) ??
    (await tx.queueEntry.findFirst({
      where: { patientId, ...activeWhere(now) },
      orderBy: [
        { dayKey: { sort: "desc", nulls: "last" } },
        { arrivedAt: "asc" },
      ],
    }));
  if (existing) {
    if (existing.dayKey === null) {
      const day = await tx.clinicQueueDay.upsert({
        where: { dayKey },
        create: { dayKey, nextNumber: 2 },
        update: { nextNumber: { increment: 1 } },
      });
      return tx.queueEntry.update({
        where: { id: existing.id },
        data: {
          dayKey,
          number: day.nextNumber - 1,
          queuedAt: existing.arrivedAt,
          revision: { increment: 1 },
        },
      });
    }
    return existing;
  }
  if ((await tx.queueEntry.count({ where: activeWhere(now) })) >= 500)
    throw new ClinicError(
      409,
      "queue_full",
      "The queue is full. Please ask the doctor before adding another arrival.",
    );
  const day = await tx.clinicQueueDay.upsert({
    where: { dayKey },
    create: { dayKey, nextNumber: 2 },
    update: { nextNumber: { increment: 1 } },
  });
  return tx.queueEntry.create({
    data: {
      patientId,
      status: "waiting",
      dayKey,
      number: day.nextNumber - 1,
      queuedAt: now,
      note: note || null,
    },
  });
}
export async function queueMutation(
  actor: ClinicActor,
  body: Record<string, unknown>,
) {
  if (actor.kind === "patient")
    throw new ClinicError(
      403,
      "role",
      "Only clinic staff can change the queue.",
    );
  const id = commandId(body.commandId),
    kind = short(body.kind, 40);
  const allowed = new Set([
    "commandId",
    "kind",
    "patientId",
    "entryId",
    "revision",
    "name",
    "phone",
    "ageYears",
    "sex",
    "note",
    "averageMinutes",
    "paused",
    "confirmDifferentPerson",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    throw new ClinicError(
      400,
      "fields",
      "The request contains an unexpected field.",
    );
  if (
    ![
      "check_in",
      "register",
      "call",
      "start",
      "return",
      "cancel",
      "settings",
    ].includes(kind)
  )
    throw new ClinicError(400, "operation", "Choose a valid queue action.");
  if (
    ["call", "start", "return", "settings"].includes(kind) &&
    actor.kind !== "doctor"
  )
    throw new ClinicError(403, "role", "Only the doctor can do that.");
  return clinicCommand(actor, id, kind, body, async (tx) => {
    if (kind === "settings") {
      if (
        body.averageMinutes !== undefined &&
        (!Number.isInteger(body.averageMinutes) ||
          Number(body.averageMinutes) < 1 ||
          Number(body.averageMinutes) > 240)
      )
        throw new ClinicError(
          400,
          "average",
          "Set an average between 1 and 240 minutes.",
        );
      if (body.paused !== undefined && typeof body.paused !== "boolean")
        throw new ClinicError(400, "paused", "Choose pause or resume.");
      await tx.clinicLiveSettings.update({
        where: { id: "clinic" },
        data: {
          ...(body.averageMinutes !== undefined
            ? { averageMinutes: Number(body.averageMinutes) }
            : {}),
          ...(body.paused !== undefined
            ? { paused: Boolean(body.paused) }
            : {}),
        },
      });
      return { saved: true };
    }
    if (kind === "check_in") {
      const entry = await checkIn(
        tx,
        recordId(body.patientId),
        short(body.note, 300),
      );
      return {
        entryId: entry.id,
        patientId: entry.patientId,
        number: entry.number,
      };
    }
    if (kind === "register") {
      const name = short(body.name, 120),
        phone = short(body.phone, 40),
        sex = short(body.sex, 1);
      const age =
        body.ageYears == null || body.ageYears === ""
          ? null
          : Number(body.ageYears);
      if (
        !name ||
        (age !== null && (!Number.isInteger(age) || age < 0 || age > 130)) ||
        (sex && !["M", "F", "O"].includes(sex))
      )
        throw new ClinicError(
          400,
          "patient_fields",
          "Check the patient name, age and sex.",
        );
      const normalizedPhone = storablePhone(phone);
      if (
        normalizedPhone &&
        (await tx.patient.findFirst({
          where: { phone: normalizedPhone },
          select: { id: true },
        })) &&
        body.confirmDifferentPerson !== true
      )
        throw new ClinicError(
          409,
          "phone_exists",
          "This phone is already on file. Search for the patient first, or confirm this is a different person sharing the phone.",
        );
      const max =
        (await tx.patient.aggregate({ _max: { fileNumber: true } }))._max
          .fileNumber ?? 0;
      const patient = await tx.patient.create({
        data: {
          name,
          phone: normalizedPhone,
          ageYears: age,
          sex: sex || null,
          fileNumber: max + 1,
        },
      });
      const entry = await checkIn(tx, patient.id, short(body.note, 300));
      return { entryId: entry.id, patientId: patient.id, number: entry.number };
    }
    const entry = await tx.queueEntry.findUnique({
      where: { id: recordId(body.entryId) },
    });
    if (!entry)
      throw new ClinicError(
        404,
        "entry_missing",
        "That arrival is no longer in the queue.",
      );
    if (!Number.isInteger(body.revision) || body.revision !== entry.revision)
      throw new ClinicError(
        409,
        "stale",
        "The queue changed. Review the latest state and try again.",
      );
    if (!ACTIVE_QUEUE.includes(entry.status as (typeof ACTIVE_QUEUE)[number]))
      throw new ClinicError(409, "finished", "That arrival has already ended.");
    if (kind === "cancel") {
      if (
        actor.kind === "staff" &&
        (entry.status !== "waiting" ||
          (entry.dayKey !== clinicDay() && entry.arrivedAt < clinicDayStart()))
      )
        throw new ClinicError(
          403,
          "role",
          "Reception can remove only today’s waiting arrivals. Ask the doctor to end another arrival.",
        );
      await tx.queueEntry.update({
        where: { id: entry.id },
        data: {
          status: "cancelled",
          seenAt: new Date(),
          revision: { increment: 1 },
        },
      });
      return { entryId: entry.id, status: "cancelled" };
    }
    const settings = await tx.clinicLiveSettings.findUniqueOrThrow({
      where: { id: "clinic" },
    });
    if (settings.paused && kind !== "return")
      throw new ClinicError(
        409,
        "paused",
        "Resume the queue before calling or starting a patient.",
      );
    if (kind === "return") {
      if (!isDoctorSlot(entry.status))
        throw new ClinicError(
          409,
          "state",
          "Only a called or consulting patient can return to waiting.",
        );
      // A consultation can cross midnight. Rejoining after the day changes
      // receives today's ticket rather than disappearing into yesterday's list.
      if (entry.dayKey !== clinicDay() && entry.arrivedAt < clinicDayStart()) {
        await tx.queueEntry.update({
          where: { id: entry.id },
          data: {
            status: "cancelled",
            seenAt: new Date(),
            revision: { increment: 1 },
          },
        });
        const replacement = await checkIn(tx, entry.patientId);
        return {
          entryId: replacement.id,
          status: "waiting",
          number: replacement.number,
        };
      }
      await tx.queueEntry.update({
        where: { id: entry.id },
        data: {
          status: "waiting",
          queuedAt: new Date(),
          calledAt: null,
          startedAt: null,
          revision: { increment: 1 },
        },
      });
      return { entryId: entry.id, status: "waiting" };
    }
    const occupied = await tx.queueEntry.findFirst({
      where: {
        status: { in: ["called", "in_consultation"] },
        id: { not: entry.id },
      },
      select: { id: true },
    });
    if (occupied)
      throw new ClinicError(
        409,
        "doctor_busy",
        "Finish or return the current patient before calling another.",
      );
    if (
      (kind === "call" && entry.status !== "waiting") ||
      (kind === "start" && !["waiting", "called"].includes(entry.status))
    )
      throw new ClinicError(
        409,
        "state",
        "That patient has already moved to a different stage.",
      );
    if (
      !isDoctorSlot(entry.status) &&
      entry.dayKey !== clinicDay() &&
      entry.arrivedAt < clinicDayStart()
    )
      throw new ClinicError(
        409,
        "old_entry",
        "Check this patient in again for today.",
      );
    if (entry.dayKey === null) await checkIn(tx, entry.patientId);
    await tx.queueEntry.update({
      where: { id: entry.id },
      data: {
        status: kind === "call" ? "called" : "in_consultation",
        calledAt: entry.calledAt ?? new Date(),
        ...(kind === "start" ? { startedAt: new Date() } : {}),
        revision: { increment: 1 },
      },
    });
    return {
      entryId: entry.id,
      status: kind === "call" ? "called" : "in_consultation",
    };
  });
}

export async function finishQueueVisit(tx: ClinicTx, patientId: string) {
  const other = await tx.queueEntry.findFirst({
    where: {
      status: { in: ["called", "in_consultation"] },
      patientId: { not: patientId },
    },
    select: { id: true },
  });
  if (other)
    throw new ClinicError(
      409,
      "doctor_busy",
      "Another patient is with the doctor. Finish that visit first.",
    );
  await tx.queueEntry.updateMany({
    where: { patientId, ...activeWhere() },
    data: {
      status: "completed",
      seenAt: new Date(),
      revision: { increment: 1 },
    },
  });
  await tx.progressPhotoRequest.updateMany({
    where: { patientId, status: "open", task: { status: { not: "pending" } } },
    data: { status: "closed", closedAt: new Date() },
  });
}
