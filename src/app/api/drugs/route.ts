import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hasClinicSession } from "@/lib/session";

// Drug autosuggest, ranked by this doctor's own usage frequency.
export async function GET(req: NextRequest) {
  // Self-authorize like every other data route; the drug list also reveals this
  // clinic's prescribing patterns. Doctor-only.
  if (!(await hasClinicSession())) {
    return NextResponse.json({ drugs: [] }, { status: 404 });
  }
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const drugs = await db.drug.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { useCount: "desc" },
    take: 6,
  });
  return NextResponse.json({ drugs });
}
