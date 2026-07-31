import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Attachments are served through the app so they stay behind the passcode gate
// (middleware guards this route) instead of sitting on a public URL.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await db.report.findUnique({
    where: { id },
    select: { fileName: true, fileMime: true, fileData: true },
  });

  if (!report?.fileData) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = new Uint8Array(report.fileData);
  return new NextResponse(body, {
    headers: {
      "Content-Type": report.fileMime || "application/octet-stream",
      "Content-Disposition": `inline; filename="${(report.fileName || "report").replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
