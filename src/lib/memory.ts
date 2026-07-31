import { db } from "@/lib/db";
import { differenceInDays, differenceInMonths, differenceInYears } from "date-fns";

// The memory card: the ≤5 lines a doctor absorbs in a 10-second glance
// before (or as) the patient walks in. Deterministic v1 — rules, not LLM —
// so it is instant, explainable, and never hallucinates.

export type MemoryLine = {
  kind: "trend" | "gap" | "lastVisit" | "note" | "allergy" | "report";
  tone: "alert" | "warn" | "ok" | "info";
  text: string;
};

export type MemoryCard = {
  headline: string; // "58 M · DM 8y · HTN 6y"
  allergies: string[];
  lines: MemoryLine[];
  activeMeds: { drugName: string; frequency: string }[];
};

// minDelta = smallest absolute change that is clinically worth a line.
export const METRIC_LABELS: Record<
  string,
  { label: string; higherIsWorse: boolean; decimals: number; minDelta: number }
> = {
  HBA1C: { label: "HbA1c", higherIsWorse: true, decimals: 1, minDelta: 0.2 },
  BP_SYS: { label: "BP", higherIsWorse: true, decimals: 0, minDelta: 6 },
  CREATININE: { label: "Creatinine", higherIsWorse: true, decimals: 2, minDelta: 0.12 },
  TSH: { label: "TSH", higherIsWorse: true, decimals: 1, minDelta: 1.0 },
  WEIGHT: { label: "Weight", higherIsWorse: true, decimals: 1, minDelta: 2 },
  LDL: { label: "LDL", higherIsWorse: true, decimals: 0, minDelta: 15 },
  FBS: { label: "FBS", higherIsWorse: true, decimals: 0, minDelta: 15 },
  PPBS: { label: "PPBS", higherIsWorse: true, decimals: 0, minDelta: 20 },
  TG: { label: "Triglycerides", higherIsWorse: true, decimals: 0, minDelta: 50 },
  HDL: { label: "HDL", higherIsWorse: false, decimals: 0, minDelta: 8 },
  HB: { label: "Hb", higherIsWorse: false, decimals: 1, minDelta: 1.2 },
  VITD: { label: "Vit D", higherIsWorse: false, decimals: 0, minDelta: 8 },
  B12: { label: "B12", higherIsWorse: false, decimals: 0, minDelta: 150 },
};

function ago(date: Date, now = new Date()): string {
  const days = differenceInDays(now, date);
  if (days < 1) return "today";
  if (days < 45) return `${days}d ago`;
  const months = differenceInMonths(now, date);
  if (months < 12) return `${months}mo ago`;
  return `${differenceInYears(now, date)}y ago`;
}

function conditionAbbrev(name: string): string {
  const map: Array<[RegExp, string]> = [
    [/type 2 diabetes|t2dm/i, "DM"],
    [/hypertension|htn/i, "HTN"],
    [/hypothyroid/i, "Hypothyroid"],
    [/asthma/i, "Asthma"],
    [/ckd/i, "CKD"],
  ];
  for (const [re, abbrev] of map) if (re.test(name)) return abbrev;
  return name;
}

export async function buildMemoryCard(patientId: string): Promise<MemoryCard | null> {
  const now = new Date();
  const patient = await db.patient.findUnique({
    where: { id: patientId },
    include: {
      conditions: { where: { status: "active" }, orderBy: { since: "asc" } },
      allergies: true,
      tasks: { where: { status: "pending" }, orderBy: { dueDate: "asc" } },
      visits: {
        orderBy: { visitDate: "desc" },
        take: 2,
        include: { prescription: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
      },
      observations: { orderBy: { measuredAt: "desc" }, take: 60 },
      // select explicitly: fileData holds attachment bytes and must not be loaded
      reports: {
        orderBy: { reportDate: "desc" },
        take: 1,
        select: { title: true, reportDate: true },
      },
    },
  });
  if (!patient) return null;

  // -------- headline --------
  const age = patient.dob ? differenceInYears(now, patient.dob) : patient.ageYears;
  const condBits = patient.conditions.map((c) => {
    const abbrev = conditionAbbrev(c.name);
    return c.since ? `${abbrev} ${differenceInYears(now, c.since)}y` : abbrev;
  });
  const headline = [age != null ? `${age} ${patient.sex ?? ""}`.trim() : patient.sex, ...condBits]
    .filter(Boolean)
    .join(" · ");

  const lines: MemoryLine[] = [];

  // -------- trends: latest vs previous per metric, worst first --------
  const byType = new Map<string, { value: number; unit: string | null; measuredAt: Date }[]>();
  for (const o of patient.observations) {
    if (!byType.has(o.type)) byType.set(o.type, []);
    byType.get(o.type)!.push({ value: o.value, unit: o.unit, measuredAt: o.measuredAt });
  }

  const trendCandidates: { severity: number; line: MemoryLine }[] = [];
  for (const [type, series] of byType) {
    const meta = METRIC_LABELS[type];
    if (!meta || series.length < 2) continue;
    if (type === "BP_DIA") continue; // reported alongside BP_SYS

    // Compare latest against both the previous reading and the oldest in the
    // window — slow drift (7.1 → 7.9 over a year) matters as much as a jump.
    const latest = series[0];
    const prev = series[1];
    const oldest = series[series.length - 1];
    const comparator =
      Math.abs(latest.value - oldest.value) > Math.abs(latest.value - prev.value) ? oldest : prev;
    const delta = latest.value - comparator.value;
    if (Math.abs(delta) < meta.minDelta) continue;
    const worsening = meta.higherIsWorse ? delta > 0 : delta < 0;

    let valueText: string;
    if (type === "BP_SYS") {
      const diaSeries = byType.get("BP_DIA") ?? [];
      const latestDia = diaSeries[0]?.value;
      const compDia = diaSeries.find(
        (d) => Math.abs(d.measuredAt.getTime() - comparator.measuredAt.getTime()) < 86400000
      )?.value;
      valueText = `${latest.value.toFixed(0)}/${latestDia?.toFixed(0) ?? "?"} from ${comparator.value.toFixed(0)}/${compDia?.toFixed(0) ?? "?"} (${ago(comparator.measuredAt, now)})`;
    } else {
      valueText = `${latest.value.toFixed(meta.decimals)}${latest.unit ?? ""} from ${comparator.value.toFixed(meta.decimals)} (${ago(comparator.measuredAt, now)})`;
    }
    const arrow = delta > 0 ? "↑" : "↓";
    trendCandidates.push({
      // severity in units of minDelta so metrics are comparable; improvements rank low
      severity: (Math.abs(delta) / meta.minDelta) * (worsening ? 1 : 0.1),
      line: {
        kind: "trend",
        tone: worsening ? "warn" : "ok",
        text: `${meta.label} ${arrow} ${valueText}`,
      },
    });
  }
  trendCandidates.sort((a, b) => b.severity - a.severity);
  lines.push(...trendCandidates.slice(0, 2).map((t) => t.line));

  // -------- gaps: overdue tasks are the loudest lines --------
  for (const task of patient.tasks) {
    if (!task.dueDate) continue;
    const overdueDays = differenceInDays(now, task.dueDate);
    if (overdueDays > 0) {
      lines.push({
        kind: "gap",
        tone: "alert",
        text:
          task.kind === "FOLLOW_UP"
            ? `Follow-up overdue by ${overdueDays}d — ${task.title}`
            : `Not done: ${task.title} (due ${ago(task.dueDate, now)})`,
      });
    }
  }

  // -------- new information since the doctor last saw them --------
  const lastVisitDate = patient.visits[0]?.visitDate;
  const latestReport = patient.reports[0];
  if (latestReport && (!lastVisitDate || latestReport.reportDate > lastVisitDate)) {
    lines.push({
      kind: "report",
      tone: "info",
      text: `New report since last visit: ${latestReport.title} (${ago(latestReport.reportDate, now)})`,
    });
  }

  // -------- last visit --------
  const lastVisit = patient.visits[0];
  if (lastVisit) {
    const what = lastVisit.complaint || lastVisit.diagnosis || "visit";
    lines.push({
      kind: "lastVisit",
      tone: "info",
      text: `Last visit ${ago(lastVisit.visitDate, now)}: ${what}`,
    });
  }

  // Sticky note intentionally NOT a card line — it renders as its own
  // editable row (StickyNoteEditor) directly beneath the card.

  return {
    headline,
    allergies: patient.allergies.map((a) => a.substance),
    lines: lines.slice(0, 5),
    activeMeds:
      lastVisit?.prescription?.items.map((i) => ({ drugName: i.drugName, frequency: i.frequency })) ?? [],
  };
}
