import QRCode from "qrcode";
import { hasClinicSession, hasStaffSession } from "@/lib/session";
import { assertAssessmentOrigin } from "@/lib/assessment-server";
import { boundedJson, liveFailure, liveJson } from "@/lib/live-http";
import {
  ClinicError,
  commandId,
  recordId,
  clinicDay,
  clinicDayStart,
} from "@/lib/live-clinic";
import {
  checkIn,
  clinicCommand,
  liveClinicEnabled,
} from "@/lib/live-clinic-server";
import { createQueueToken } from "@/lib/patientLink";
import { queueTicketSnapshot } from "@/lib/queue-ticket";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!liveClinicEnabled()) return liveJson({ message: "Not found" }, 404);
    const header = request.headers.get("authorization") || "";
    if (!header.startsWith("Bearer "))
      throw new ClinicError(
        401,
        "ticket_expired",
        "Ask reception for your current queue link.",
      );
    return liveJson(await queueTicketSnapshot(header.slice(7)));
  } catch (error) {
    return liveFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (!liveClinicEnabled()) return liveJson({ message: "Not found" }, 404);
    assertAssessmentOrigin(request);
    const actor = (await hasClinicSession())
      ? { kind: "doctor" as const }
      : (await hasStaffSession())
        ? { kind: "staff" as const }
        : null;
    if (!actor)
      throw new ClinicError(
        403,
        "role",
        "Only reception or the doctor can issue a queue ticket.",
      );
    const body = await boundedJson(request);
    if (
      Object.keys(body).some((key) => !["entryId", "commandId"].includes(key))
    )
      throw new ClinicError(400, "fields", "Use the queue ticket control.");
    const entryId = recordId(body.entryId);
    const ref = await clinicCommand(
      actor,
      commandId(body.commandId),
      "queue_ticket",
      { entryId },
      async (tx) => {
        let entry = await tx.queueEntry.findUnique({
          where: { id: entryId },
          include: { patient: { select: { linkVersion: true } } },
        });
        if (
          !entry ||
          !["waiting", "called", "in_consultation"].includes(entry.status) ||
          (entry.status === "waiting" &&
            entry.dayKey !== clinicDay() &&
            entry.arrivedAt < clinicDayStart())
        )
          throw new ClinicError(
            409,
            "arrival_ended",
            "Check the patient in before sharing today's queue link.",
          );
        if (entry.dayKey === null) {
          await checkIn(tx, entry.patientId);
          entry = await tx.queueEntry.findUniqueOrThrow({
            where: { id: entryId },
            include: { patient: { select: { linkVersion: true } } },
          });
        }
        return {
          patientId: entry.patientId,
          entryId: entry.id,
          version: entry.patient.linkVersion,
        };
      },
    );
    const token = await createQueueToken(
      ref.patientId,
      ref.entryId,
      ref.version,
    );
    const url = new URL(
      `/q/${token}`,
      process.env.MEDSPACE_SITE_URL || request.url,
    ).href;
    const qr = await QRCode.toDataURL(url, {
      width: 220,
      margin: 2,
      errorCorrectionLevel: "L",
    });
    return liveJson({ url, qr });
  } catch (error) {
    return liveFailure(error);
  }
}
