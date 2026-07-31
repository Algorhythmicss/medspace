import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Instant patient lookup: name fragment, phone fragment, or file number.
// Budget: whole round trip well under a second on clinic hardware.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) return NextResponse.json({ patients: [] });

  const asNumber = Number(q);
  const patients = await db.patient.findMany({
    where: {
      OR: [
        { name: { contains: q } },
        { phone: { contains: q } },
        ...(Number.isInteger(asNumber) && asNumber > 0 ? [{ fileNumber: asNumber }] : []),
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
