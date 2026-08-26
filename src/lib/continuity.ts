import { db } from "@/lib/db";

// The small set of numbers a clinic can use to judge a pilot without turning
// medSpace into an analytics suite. These are observed workflow events, not
// claims of causation: consults happened, repeat visits happened, follow-ups
// were closed, and patient plans were opened.
export type PracticePulse = {
  days: number;
  consultations: number;
  repeatVisits: number;
  followUpsClosed: number;
  plansOpened: number;
};

export async function loadPracticePulse(
  now = new Date(),
  days = 30
): Promise<PracticePulse> {
  const since = new Date(now.getTime() - days * 86400000);

  const [activePatients, followUpsClosed, plansOpened] = await Promise.all([
    db.patient.findMany({
      where: { visits: { some: { visitDate: { gte: since, lte: now } } } },
      select: {
        _count: { select: { visits: true } },
        visits: {
          where: { visitDate: { gte: since, lte: now } },
          select: { id: true },
        },
      },
    }),
    db.carePlanTask.count({
      where: {
        kind: "FOLLOW_UP",
        status: "done",
        completedAt: { gte: since, lte: now },
      },
    }),
    db.patient.count({
      where: { planLastOpenedAt: { gte: since, lte: now } },
    }),
  ]);

  let consultations = 0;
  let repeatVisits = 0;
  for (const patient of activePatients) {
    const visitsInWindow = patient.visits.length;
    consultations += visitsInWindow;

    // If an earlier visit exists, every visit in this window is a return. If
    // the patient's entire history is inside the window, only their first one
    // is an initial visit and the rest are repeats.
    const hasEarlierVisit = patient._count.visits > visitsInWindow;
    repeatVisits += hasEarlierVisit
      ? visitsInWindow
      : Math.max(0, visitsInWindow - 1);
  }

  return { days, consultations, repeatVisits, followUpsClosed, plansOpened };
}
