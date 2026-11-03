import { assertAssessmentOrigin } from "@/lib/assessment-server";
import { ClinicError } from "@/lib/live-clinic";
import {
  liveActor,
  patientActor,
  liveClinicEnabled,
  liveSnapshot,
  queueMutation,
} from "@/lib/live-clinic-server";
import { hasClinicSession, hasStaffSession } from "@/lib/session";
import { boundedJson, liveFailure, liveJson } from "@/lib/live-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    if (!liveClinicEnabled()) return liveJson({ message: "Not found" }, 404);
    const view = new URL(request.url).searchParams.get("view");
    const actor =
      view === "patient"
        ? await patientActor(request)
        : view === "doctor"
          ? (await hasClinicSession())
            ? { kind: "doctor" as const }
            : null
          : view === "staff"
            ? (await hasStaffSession()) || (await hasClinicSession())
              ? { kind: "staff" as const }
              : null
            : view === null
              ? await liveActor(request)
              : null;
    if (!actor)
      throw new ClinicError(
        401,
        "expired",
        "Sign in again or ask the clinic for a new care link.",
      );
    return liveJson(await liveSnapshot(actor));
  } catch (error) {
    return liveFailure(error);
  }
}
export async function POST(request: Request) {
  try {
    if (!liveClinicEnabled()) return liveJson({ message: "Not found" }, 404);
    assertAssessmentOrigin(request);
    const actor = await liveActor(request);
    if (!actor)
      throw new ClinicError(
        401,
        "expired",
        "Sign in again to update the queue.",
      );
    const result = await queueMutation(actor, await boundedJson(request));
    return liveJson({ ok: true, result, snapshot: await liveSnapshot(actor) });
  } catch (error) {
    return liveFailure(error);
  }
}
