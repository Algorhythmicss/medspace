import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasClinicSession } from "@/lib/session";
import { INLINE_SAFE_MIME } from "@/lib/reports";

// Attachments are served through the app so they stay behind the passcode gate
// instead of sitting on a public URL. The proxy/middleware gate covers this
// route, but a Route Handler must not rely on that alone — it checks the
// session itself, and answers 404 (not 307) so an unauthenticated caller can't
// even confirm the file exists.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!(await hasClinicSession())) {
    return new NextResponse("Not found", { status: 404 });
  }

  const report = await db.report.findUnique({
    where: { id },
    select: { fileName: true, fileMime: true, fileData: true },
  });

  if (!report?.fileData) {
    return new NextResponse("Not found", { status: 404 });
  }

  const mime = report.fileMime || "application/octet-stream";
  // Only render in the browser if the type is one we trust; everything else is
  // forced to download so an uploaded SVG/HTML can't execute on this origin.
  const disposition = INLINE_SAFE_MIME.has(mime) ? "inline" : "attachment";
  const body = new Uint8Array(report.fileData);

  return new NextResponse(body, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `${disposition}; filename="${(report.fileName || "report").replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
