import { db } from "@/lib/db";
import { readQueueToken } from "@/lib/patientLink";
import {
  ClinicError,
  clinicDayStart,
  type ClinicSnapshot,
  type QueueStatus,
} from "@/lib/live-clinic";
import { liveSnapshot } from "@/lib/live-clinic-server";
export async function queueTicketSnapshot(
  token: string,
): Promise<ClinicSnapshot> {
  const ref = await readQueueToken(token);
  if (!ref)
    throw new ClinicError(
      401,
      "ticket_expired",
      "This queue link has expired. Ask reception for your current ticket.",
    );
  const snapshot = await liveSnapshot({
    kind: "patient",
    patientId: ref.p,
    version: ref.v,
  });
  const entry = await db.queueEntry.findFirst({
    where: { id: ref.q, patientId: ref.p, patient: { linkVersion: ref.v } },
    select: {
      id: true,
      number: true,
      dayKey: true,
      status: true,
      arrivedAt: true,
    },
  });
  if (!entry)
    throw new ClinicError(
      401,
      "ticket_expired",
      "This queue link is no longer available. Ask reception for your current ticket.",
    );
  return {
    role: "patient",
    revision: snapshot.revision,
    serverTime: snapshot.serverTime,
    dayKey: snapshot.dayKey,
    settings: snapshot.settings,
    patientQueue:
      snapshot.patientQueue?.entry?.id === entry.id
        ? snapshot.patientQueue
        : {
            entry: {
              id: entry.id,
              number: entry.number,
              dayKey: entry.dayKey,
              status:
                entry.status === "waiting" &&
                entry.dayKey !== snapshot.dayKey &&
                entry.arrivedAt < clinicDayStart(new Date(snapshot.serverTime))
                  ? "expired"
                  : (entry.status as QueueStatus),
            },
            position: null,
            ahead: null,
            estimateMinutes: null,
          },
  };
}
