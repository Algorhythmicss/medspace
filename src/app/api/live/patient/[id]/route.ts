import { assertAssessmentOrigin } from "@/lib/assessment-server";
import { hasClinicSession } from "@/lib/session";
import { ClinicError, recordId } from "@/lib/live-clinic";
import { liveClinicEnabled } from "@/lib/live-clinic-server";
import {
  doctorCareMutation,
  doctorPatientSnapshot,
} from "@/lib/live-care-server";
import { boundedJson, liveFailure, liveJson } from "@/lib/live-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function authorize(params: Promise<{ id: string }>) {
  if (!liveClinicEnabled()) throw new ClinicError(404, "missing", "Not found");
  if (!(await hasClinicSession()))
    throw new ClinicError(404, "missing", "Not found");
  return recordId((await params).id);
}
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    return liveJson(await doctorPatientSnapshot(await authorize(params)));
  } catch (error) {
    return liveFailure(error);
  }
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const id = await authorize(params);
    assertAssessmentOrigin(request);
    const result = await doctorCareMutation(
      { kind: "doctor" },
      id,
      await boundedJson(request),
    );
    return liveJson({
      ok: true,
      result,
      snapshot: await doctorPatientSnapshot(id),
    });
  } catch (error) {
    return liveFailure(error);
  }
}
