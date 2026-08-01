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

// A metric worth showing as a chip with a sparkline. Carried on the card so
// the chart doesn't need a second query or a competing "Trends" section.
export type MemoryMetric = {
  type: string;
  label: string;
  latest: number;
  unit: string | null;
  decimals: number;
  points: number[]; // chronological
  higherIsWorse: boolean;
  minDelta: number;
  paired?: string; // e.g. diastolic, rendered as "148/94"
};

// A reading the patient logged from home. Kept OUT of the clinical trend/
// sparkline (those stay clinic/lab-measured) and shown as its own tagged strip,
// so a home cuff reading is never mistaken for a clinic-measured one.
export type HomeReading = {
  label: string; // "BP", "Sugar (fasting)", "Weight"
  value: string; // "150/95", "140 mg/dL", "81 kg"
  measuredAt: Date;
  count: number; // how many of this reading the patient has logged in-window
};

export type MemoryCard = {
  headline: string; // "58 M · DM 8y · HTN 6y"
  allergies: string[];
  lines: MemoryLine[];
  metrics: MemoryMetric[];
  homeReadings: HomeReading[];
  activeMeds: { drugName: string; frequency: string }[];
};

// Most urgent first. An overdue follow-up outranks a drifting number, and a
// drifting number outranks "last visit was 2 months ago" — the doctor should
// never have to scan for the thing that matters.
const TONE_RANK: Record<MemoryLine["tone"], number> = {
  alert: 0,
  warn: 1,
  ok: 2,
  info: 3,
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
  const [patient, homeObs] = await Promise.all([
    db.patient.findUnique({
      where: { id: patientId },
      include: {
        conditions: { where: { status: "active" }, orderBy: { since: "asc" } },
        allergies: true,
        tasks: { where: { status: "pending" }, orderBy: { dueDate: "asc" } },
        visits: {
          orderBy: { visitDate: "desc" },
          take: 5,
          include: { prescription: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
        },
        // Clinic/lab-measured only. Patient home readings are fetched separately
        // (below) so a burst of home logging can never crowd real clinic history
        // out of this window and blank the trend lines and sparklines.
        observations: {
          where: { source: { not: "patient" } },
          orderBy: { measuredAt: "desc" },
          take: 60,
        },
        // select explicitly: fileData holds attachment bytes and must not be loaded
        reports: {
          orderBy: { reportDate: "desc" },
          take: 1,
          select: { title: true, reportDate: true },
        },
      },
    }),
    // Patient-logged readings on their own window, so home history survives no
    // matter how much clinic history exists (and vice versa).
    db.observation.findMany({
      where: { patientId, source: "patient" },
      orderBy: { measuredAt: "desc" },
      take: 60,
    }),
  ]);
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
  // Clinical trends and sparklines use CLINIC/LAB measurements only. Patient-
  // logged home readings are surfaced separately (below) and never fused into
  // the arrow that drives a clinical decision — a safety rule, not cosmetics.
  // patient.observations is already clinic/lab-only (query excludes source:"patient")
  const byType = new Map<string, { value: number; unit: string | null; measuredAt: Date }[]>();
  for (const o of patient.observations) {
    if (!byType.has(o.type)) byType.set(o.type, []);
    byType.get(o.type)!.push({ value: o.value, unit: o.unit, measuredAt: o.measuredAt });
  }

  // -------- home readings (patient-logged, tagged, kept off the trend) --------
  const latestHome = (type: string) =>
    homeObs.find((o) => o.type === type); // fetched newest-first
  const countHome = (type: string) =>
    homeObs.reduce((n, o) => (o.type === type ? n + 1 : n), 0);
  const homeReadings: HomeReading[] = [];
  const homeBpSys = latestHome("BP_SYS");
  if (homeBpSys) {
    const dia = homeObs.find(
      (o) => o.type === "BP_DIA" && Math.abs(o.measuredAt.getTime() - homeBpSys.measuredAt.getTime()) < 3600000
    );
    homeReadings.push({
      label: "BP",
      value: `${homeBpSys.value.toFixed(0)}/${dia?.value.toFixed(0) ?? "?"}`,
      measuredAt: homeBpSys.measuredAt,
      count: countHome("BP_SYS"),
    });
  }
  const homeSugar = latestHome("FBS");
  if (homeSugar) {
    homeReadings.push({
      label: "Sugar (F)",
      value: `${homeSugar.value.toFixed(0)} mg/dL`,
      measuredAt: homeSugar.measuredAt,
      count: countHome("FBS"),
    });
  }
  const homeWeight = latestHome("WEIGHT");
  if (homeWeight) {
    homeReadings.push({
      label: "Weight",
      value: `${homeWeight.value.toFixed(1)} kg`,
      measuredAt: homeWeight.measuredAt,
      count: countHome("WEIGHT"),
    });
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

    // "Creatinine ↑ 1.10 → 1.40 mg/dL, 9mo" — arrow notation scans faster and
    // wraps less than prose on a phone.
    const when = ago(comparator.measuredAt, now).replace(/ ago$/, "");
    let valueText: string;
    if (type === "BP_SYS") {
      const diaSeries = byType.get("BP_DIA") ?? [];
      const latestDia = diaSeries[0]?.value;
      const compDia = diaSeries.find(
        (d) => Math.abs(d.measuredAt.getTime() - comparator.measuredAt.getTime()) < 86400000
      )?.value;
      valueText = `${comparator.value.toFixed(0)}/${compDia?.toFixed(0) ?? "?"} → ${latest.value.toFixed(0)}/${latestDia?.toFixed(0) ?? "?"}, ${when}`;
    } else {
      valueText = `${comparator.value.toFixed(meta.decimals)} → ${latest.value.toFixed(meta.decimals)}${latest.unit ?? ""}, ${when}`;
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

  // -------- gaps --------
  // One line, however many items. The chart lists them individually right
  // below; repeating each here verbatim doubled the reading for no gain.
  const overdue = patient.tasks.filter(
    (t) => t.dueDate && differenceInDays(now, t.dueDate) > 0
  );
  if (overdue.length === 1) {
    const t = overdue[0];
    const days = differenceInDays(now, t.dueDate!);
    lines.push({
      kind: "gap",
      tone: "alert",
      text:
        t.kind === "FOLLOW_UP"
          ? `Follow-up overdue ${days}d — ${t.title}`
          : `${t.title} not done — ordered ${days}d ago`,
    });
  } else if (overdue.length > 1) {
    const oldest = differenceInDays(now, overdue[0].dueDate!);
    // Titles deliberately omitted — they are listed in full directly below.
    lines.push({
      kind: "gap",
      tone: "alert",
      text: `${overdue.length} things overdue, oldest by ${oldest} days`,
    });
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

  // Sticky note intentionally NOT a card line — it renders inline at the
  // foot of the briefing card, tappable to edit.

  // -------- metric chips (sparkline data) --------
  const METRIC_ORDER = ["HBA1C", "BP_SYS", "CREATININE", "TSH", "LDL", "FBS", "PPBS", "WEIGHT"];
  const metrics: MemoryMetric[] = [];
  for (const type of METRIC_ORDER) {
    const meta = METRIC_LABELS[type];
    const series = byType.get(type);
    if (!meta || !series || series.length < 2) continue;
    // stored newest-first; sparklines read left→right in time
    const chron = [...series].reverse();
    metrics.push({
      type,
      label: meta.label,
      latest: series[0].value,
      unit: series[0].unit,
      decimals: meta.decimals,
      points: chron.slice(-8).map((p) => p.value),
      higherIsWorse: meta.higherIsWorse,
      minDelta: meta.minDelta,
      paired:
        type === "BP_SYS" && byType.get("BP_DIA")?.[0]
          ? byType.get("BP_DIA")![0].value.toFixed(0)
          : undefined,
    });
  }

  return {
    headline,
    allergies: patient.allergies.map((a) => a.substance),
    lines: lines
      .map((line, i) => ({ line, i }))
      .sort((a, b) => TONE_RANK[a.line.tone] - TONE_RANK[b.line.tone] || a.i - b.i)
      .map(({ line }) => line)
      .slice(0, 5),
    metrics: metrics.slice(0, 4),
    homeReadings,
    // Active meds = the most recent prescription on record, not necessarily the
    // last visit's (a lab-review visit re-issues nothing). Same rule the patient
    // plan uses, so the two surfaces never disagree on what the patient is on.
    activeMeds:
      (patient.visits.find((v) => (v.prescription?.items.length ?? 0) > 0)?.prescription?.items ?? []).map(
        (i) => ({ drugName: i.drugName, frequency: i.frequency })
      ),
  };
}
