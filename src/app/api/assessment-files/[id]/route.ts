import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasClinicSession } from "@/lib/session";
import { assessmentEnabled, assessmentPatient } from "@/lib/assessment-server";
import { downloadableAssessmentFile } from "@/lib/assessment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };
const missing = () => new NextResponse("Not found", { status: 404, headers: privateHeaders });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!assessmentEnabled()) return missing();
  const { id } = await params;
  if (!/^[a-z0-9]{20,32}$/.test(id)) return missing();
  try {
    const doctor = !request.headers.has("authorization") && await hasClinicSession();
    const patient = doctor ? null : await assessmentPatient(request);
    if (!doctor && !patient) return missing();
    const where = {
      id,
      ...(!doctor && patient ? { assessment: { patientId: patient.p, patient: { linkVersion: patient.v } } } : {}),
    };
    const metadata = await db.assessmentFile.findFirst({ where, select: { scanStatus: true } });
    if (!metadata) return missing();
    if (!downloadableAssessmentFile(metadata.scanStatus)) {
      return NextResponse.json({ message: metadata.scanStatus === "rejected" ? "This file did not pass its safety scan." : "This file is awaiting a private safety scan and cannot be downloaded yet." }, { status: 423, headers: privateHeaders });
    }
    const file = await db.assessmentFile.findFirst({
      where: { ...where, scanStatus: { in: ["rewritten", "clean"] } },
      select: { data: true, name: true },
    });
    if (!file) return missing();
    const encoded = encodeURIComponent(file.name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const extension = file.name.split(".").pop()?.replace(/[^a-z0-9]/gi, "") || "bin";
    return new NextResponse(new Uint8Array(file.data), {
      headers: {
        ...privateHeaders,
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="medical-record.${extension}"; filename*=UTF-8''${encoded}`,
        "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Frame-Options": "DENY",
      },
    });
  } catch {
    return new NextResponse("File temporarily unavailable", { status: 503, headers: privateHeaders });
  }
}
