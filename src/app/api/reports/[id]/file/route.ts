import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasClinicSession } from "@/lib/session";
import { AssessmentError } from "@/lib/assessment";
import { prepareReportDownload } from "@/lib/report-attachments";

export const runtime = "nodejs";
export const maxDuration = 60;

const privateHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox; frame-ancestors 'none'",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

// Attachments are served through the app so they stay behind the passcode gate
// instead of sitting on a public URL. The proxy/middleware gate covers this
// route, but a Route Handler must not rely on that alone — it checks the
// session itself, and answers 404 (not 307) so an unauthenticated caller can't
// even confirm the file exists.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await hasClinicSession())) {
    return new NextResponse("Not found", { status: 404, headers: privateHeaders });
  }

  try {
    const report = await db.report.findUnique({
      where: { id },
      select: { fileName: true, fileMime: true, fileData: true },
    });
    if (!report?.fileData || !report.fileName) return new NextResponse("Not found", { status: 404, headers: privateHeaders });
    const file = await prepareReportDownload({ name: report.fileName, mime: report.fileMime || "application/octet-stream", bytes: new Uint8Array(report.fileData) });
    const encoded = encodeURIComponent(file.name).replace(/['()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    const extension = file.name.split(".").pop() || "bin";
    return new NextResponse(file.bytes, { headers: {
      ...privateHeaders,
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="medical-record.${extension}"; filename*=UTF-8''${encoded}`,
    } });
  } catch (error) {
    if (error instanceof AssessmentError) return NextResponse.json({ message: "This stored attachment has not passed the required safety checks and cannot be downloaded yet." }, { status: 423, headers: privateHeaders });
    console.error("report attachment request failed");
    return NextResponse.json({ message: "The attachment is temporarily unavailable. Please retry or contact the clinic." }, { status: 503, headers: privateHeaders });
  }
}
