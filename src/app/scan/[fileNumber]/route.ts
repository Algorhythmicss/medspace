import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Scan target for the QR printed on every prescription: any phone camera
// resolves /scan/<fileNumber> straight to the patient's chart.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileNumber: string }> }
) {
  const { fileNumber } = await params;
  const n = Number(fileNumber);
  const patient = Number.isInteger(n)
    ? await db.patient.findUnique({ where: { fileNumber: n } })
    : null;

  const target = patient ? `/patients/${patient.id}` : "/";
  return NextResponse.redirect(new URL(target, req.url));
}
