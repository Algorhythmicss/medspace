import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasClinicSession } from "@/lib/session";

// Instant patient lookup: name fragment, phone fragment, or file number.
// Budget: whole round trip well under a second on clinic hardware.
export async function GET(req: NextRequest) {
  // Self-authorize — this returns full patient PII plus active conditions, so it
  // must not rely on the edge gate alone. 404 (not 401) so it doesn't even admit
  // the route exists to an unauthenticated caller. Doctor-only: staff never see
  // clinical data, and the queue uses its own guarded search action.
  if (!(await hasClinicSession())) {
    return NextResponse.json({ patients: [] }, { status: 404 });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ patients: [] });

  const asNumber = Number(q);
  // A file number is a small int; a phone-length number overflows Postgres int4
  // and throws "out of range for integer", crashing the whole lookup — so only
  // treat the query as a file number when it fits one.
  const asFileNumber =
    Number.isInteger(asNumber) && asNumber > 0 && asNumber <= 2147483647 ? asNumber : null;
  // Case-insensitive on name so "verma" finds "Verma" — the doctor types fast
  // and lowercase on the ≤5s lookup path. Phone stays a plain substring (digits
  // typed against stored numbers); formatted-number matching is a known gap
  // (stored phones aren't normalised — see AGENTS.md).
  const patients = await db.patient.findMany({
    where: {
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
        ...(asFileNumber !== null ? [{ fileNumber: asFileNumber }] : []),
      ],
    },
    include: {
      conditions: { where: { status: "active" }, select: { name: true } },
      visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } },
    },
    take: 8,
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({
    patients: patients.map((p) => ({
      id: p.id,
      fileNumber: p.fileNumber,
      name: p.name,
      phone: p.phone,
      sex: p.sex,
      ageYears: p.ageYears,
      conditions: p.conditions.map((c) => c.name),
      lastVisit: p.visits[0]?.visitDate ?? null,
    })),
  });
}
