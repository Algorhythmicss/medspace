import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasClinicSession } from "@/lib/session";

// Scan target for the QR printed on every prescription: any phone camera
// resolves /scan/<fileNumber> straight to the patient's chart.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ fileNumber: string }> }
) {
  // Self-authorize before touching the DB — without this, a proxy regression
  // would turn this into a fileNumber -> patient-UUID oracle (and a redirect
  // into a chart) for anyone. Doctor-only; sends others to sign in first.
  if (!(await hasClinicSession())) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
  const { fileNumber } = await params;
  const n = Number(fileNumber);
  const patient = Number.isInteger(n)
    ? await db.patient.findUnique({ where: { fileNumber: n } })
    : null;

  const target = patient ? `/patients/${patient.id}` : "/";
  return NextResponse.redirect(new URL(target, req.url));
}
