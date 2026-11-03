import { db } from "@/lib/db";
import { hasClinicSession } from "@/lib/session";
import { liveClinicEnabled, patientActor } from "@/lib/live-clinic-server";
import { liveHeaders, liveJson, liveFailure } from "@/lib/live-http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const denied = () => liveJson({ message: "Not found" }, 404);
    if (!liveClinicEnabled()) return denied();
    const { id } = await params;
    if (!/^[a-z0-9]{20,32}$/.test(id)) return denied();
    const view = new URL(request.url).searchParams.get("view");
    const doctor = view !== "patient" && (await hasClinicSession());
    if (view === "doctor" && !doctor) return denied();
    const patient = doctor ? null : await patientActor(request);
    if (!doctor && !patient) return denied();
    const media = await db.careMedia.findFirst({
      where: {
        id,
        ...(doctor
          ? {}
          : {
              patientId: patient!.patientId,
              patient: { linkVersion: patient!.version },
              OR: [
                { kind: "progress_photo" },
                { kind: "doctor_audio", sharedAt: { not: null } },
              ],
            }),
      },
      select: { name: true, mime: true, data: true, size: true },
    });
    if (!media) return denied();
    return new Response(new Uint8Array(media.data), {
      headers: {
        ...liveHeaders,
        "Content-Type": media.mime,
        "Content-Length": String(media.size),
        "Content-Disposition": `attachment; filename="${encodeURIComponent(media.name)}"`,
        "Content-Security-Policy":
          "default-src 'none'; sandbox; frame-ancestors 'none'",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Frame-Options": "DENY",
      },
    });
  } catch (error) {
    return liveFailure(error);
  }
}
