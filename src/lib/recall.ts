import { db } from "@/lib/db";

// The other half of the follow-up wedge — the patients who fell off the radar.
//
// /followups only shows people the doctor gave an explicit follow-up date. But
// the bigger loss is the chronic patient (HTN, diabetes, thyroid…) who simply
// stopped coming and was never flagged — no pending task, no recent visit, just
// gone. That patient is invisible to every list in the app today. This finds
// them: an active chronic condition, nothing scheduled, and no visit in months.
//
// Deterministic and pure of side effects, like memory.ts / reach.ts. Stateless
// by design: the moment a drifter visits (a new Visit row appears), they drop
// off this list on their own — no "recalled" flag to manage.

/** A chronic patient with no visit in this many months, and nothing pending,
 *  has drifted. ~4mo: a quarterly review is already a month overdue. */
export const DRIFT_MONTHS = 4;

export type Drifter = {
  id: string;
  name: string;
  phone: string | null;
  linkVersion: number;
  ageYears: number | null;
  sex: string | null;
  dob: Date | null;
  conditions: string[];
  lastVisit: Date | null;
  planShareCount: number;
  planSharedAt: Date | null;
  planOpenCount: number;
  planLastOpenedAt: Date | null;
  planReplyKind: string | null;
};

export async function findChronicDrifters(
  now = new Date(),
  months = DRIFT_MONTHS
): Promise<Drifter[]> {
  const cutoff = new Date(now);
  cutoff.setMonth(cutoff.getMonth() - months);

  const patients = await db.patient.findMany({
    where: {
      // has at least one active chronic problem…
      conditions: { some: { status: "active" } },
      // …nothing already scheduled (so this never double-lists a patient the
      // follow-up section is already showing)…
      tasks: { none: { status: "pending" } },
      // …and no visit inside the window (covers "last visit is old" and, by
      // vacuous truth, "never visited").
      visits: { none: { visitDate: { gte: cutoff } } },
    },
    select: {
      id: true,
      name: true,
      phone: true,
      linkVersion: true,
      ageYears: true,
      sex: true,
      dob: true,
      planShareCount: true,
      planSharedAt: true,
      planOpenCount: true,
      planLastOpenedAt: true,
      planReplyKind: true,
      conditions: { where: { status: "active" }, select: { name: true } },
      visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } },
    },
  });

  return patients
    .map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      linkVersion: p.linkVersion,
      ageYears: p.ageYears,
      sex: p.sex,
      dob: p.dob,
      conditions: p.conditions.map((c) => c.name),
      lastVisit: p.visits[0]?.visitDate ?? null,
      planShareCount: p.planShareCount,
      planSharedAt: p.planSharedAt,
      planOpenCount: p.planOpenCount,
      planLastOpenedAt: p.planLastOpenedAt,
      planReplyKind: p.planReplyKind,
    }))
    // longest-gone first — the doctor works down from the coldest
    .sort((a, b) => (a.lastVisit?.getTime() ?? 0) - (b.lastVisit?.getTime() ?? 0));
}
