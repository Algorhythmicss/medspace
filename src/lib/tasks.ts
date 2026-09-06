import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { REPORT_METRICS } from "@/lib/metrics";

type CarePlanTaskStore = Pick<Prisma.TransactionClient, "carePlanTask">;

// Words too generic to indicate the same investigation on their own.
const STOPWORDS = new Set(["test", "tests", "profile", "repeat", "with", "and", "before", "next", "visit", "review"]);

export function tokens(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
  );
}

// When the doctor orders labs at a visit, older pending lab orders that overlap
// (e.g. last visit's "Lipid profile + KFT" vs today's "Lipid profile") are
// superseded — the new order is the current truth. Marked cancelled, not done:
// the test never happened.
export async function supersedeStaleLabTasks(
  patientId: string,
  newLabTitles: string[],
  currentVisitId: string,
  store: CarePlanTaskStore = db
): Promise<number> {
  if (newLabTitles.length === 0) return 0;
  const newTokens = newLabTitles.map(tokens);

  const stale = await store.carePlanTask.findMany({
    where: {
      patientId,
      status: "pending",
      kind: "LAB_TEST",
      // NULL-safe: `not` alone would drop rows with no visitId
      OR: [{ visitId: null }, { visitId: { not: currentVisitId } }],
    },
  });

  const toCancel = stale.filter((task) => {
    const old = tokens(task.title);
    return newTokens.some((fresh) => [...fresh].some((w) => old.has(w)));
  });

  if (toCancel.length > 0) {
    await store.carePlanTask.updateMany({
      where: { id: { in: toCancel.map((t) => t.id) } },
      data: { status: "cancelled" },
    });
  }
  return toCancel.length;
}

// When a report arrives carrying values for a metric, the pending lab order
// that asked for it is done — the test happened. Marked done (not cancelled).
export async function completeMatchingLabTasks(
  patientId: string,
  metricTypes: string[],
  completedAt: Date
): Promise<number> {
  if (metricTypes.length === 0) return 0;
  const aliasSet = new Set(
    REPORT_METRICS.filter((m) => metricTypes.includes(m.type)).flatMap((m) => m.aliases)
  );
  if (aliasSet.size === 0) return 0;

  const pending = await db.carePlanTask.findMany({
    where: { patientId, status: "pending", kind: "LAB_TEST" },
  });
  const toComplete = pending.filter((task) =>
    [...tokens(task.title)].some((w) => aliasSet.has(w))
  );

  if (toComplete.length > 0) {
    await db.carePlanTask.updateMany({
      where: { id: { in: toComplete.map((t) => t.id) } },
      data: { status: "done", completedAt },
    });
  }
  return toComplete.length;
}
