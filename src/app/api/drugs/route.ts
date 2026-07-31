import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Drug autosuggest, ranked by this doctor's own usage frequency.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const drugs = await db.drug.findMany({
    where: q ? { name: { contains: q } } : undefined,
    orderBy: { useCount: "desc" },
    take: 6,
  });
  return NextResponse.json({ drugs });
}
