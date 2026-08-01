import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// TEMPORARY production diagnostic — remove after debugging the deploy.
export const dynamic = "force-dynamic";

async function step(name: string, fn: () => Promise<unknown>) {
  try {
    const v = await fn();
    return { name, ok: true, sample: typeof v === "number" ? v : Array.isArray(v) ? v.length : "ok" };
  } catch (e) {
    const err = e as { name?: string; code?: string; message?: string };
    return {
      name,
      ok: false,
      error: { name: err?.name ?? null, code: err?.code ?? null, message: String(err?.message ?? e).slice(0, 700) },
    };
  }
}

export async function GET() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  // Run the Today page's exact queries — individually, then all-at-once — so we
  // see whether it's one query or the concurrency/pooler that fails.
  const individual = [];
  individual.push(await step("clinic.findUnique", () => db.clinic.findUnique({ where: { id: "clinic" } })));
  individual.push(await step("carePlanTask.count", () => db.carePlanTask.count({ where: { status: "pending", dueDate: { lt: todayStart } } })));
  individual.push(await step("carePlanTask.findMany+join", () =>
    db.carePlanTask.findMany({ where: { status: "pending", dueDate: { gte: todayStart, lt: todayEnd } }, include: { patient: { select: { id: true, name: true } } } })
  ));
  individual.push(await step("patient.findMany+joins", () =>
    db.patient.findMany({ orderBy: { updatedAt: "desc" }, take: 6, include: { conditions: { where: { status: "active" }, select: { name: true } }, visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } } } })
  ));

  const concurrent = await step("Promise.all (all four at once, like the page)", () =>
    Promise.all([
      db.clinic.findUnique({ where: { id: "clinic" } }),
      db.carePlanTask.count({ where: { status: "pending", dueDate: { lt: todayStart } } }),
      db.carePlanTask.findMany({ where: { status: "pending", dueDate: { gte: todayStart, lt: todayEnd } }, include: { patient: { select: { id: true, name: true } } } }),
      db.patient.findMany({ orderBy: { updatedAt: "desc" }, take: 6, include: { conditions: { where: { status: "active" }, select: { name: true } }, visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } } } }),
    ])
  );

  return NextResponse.json({ individual, concurrent });
}
