import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  Pill,
  Paperclip,
} from "lucide-react";
import { db } from "@/lib/db";
import { buildMemoryCard, METRIC_LABELS } from "@/lib/memory";
import MemoryCardView from "@/components/MemoryCardView";
import StickyNoteEditor from "@/components/StickyNoteEditor";
import Sparkline from "@/components/Sparkline";
import { relDay, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function PatientChart({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [patient, card, trendObs] = await Promise.all([
    db.patient.findUnique({
      where: { id },
      include: {
        visits: {
          orderBy: { visitDate: "desc" },
          include: {
            prescription: { include: { items: { orderBy: { sortOrder: "asc" } } } },
            observations: true,
          },
        },
        tasks: { where: { status: "pending" }, orderBy: { dueDate: "asc" } },
        // never select fileData here — it would pull file bytes into the page
        reports: {
          orderBy: { reportDate: "desc" },
          take: 5,
          select: { id: true, title: true, kind: true, reportDate: true, summary: true, fileName: true },
        },
      },
    }),
    buildMemoryCard(id),
    db.observation.findMany({
      where: { patientId: id, type: { in: [...Object.keys(METRIC_LABELS), "BP_DIA"] } },
      orderBy: { measuredAt: "asc" },
    }),
  ]);
  if (!patient || !card) notFound();

  // series per metric, chronological; BP shown as systolic
  const TREND_ORDER = ["HBA1C", "BP_SYS", "CREATININE", "TSH", "LDL", "FBS", "PPBS", "WEIGHT", "HDL", "TG", "HB", "VITD", "B12"];
  const seriesByType = new Map<string, { values: number[]; latest: number; unit: string | null }>();
  for (const o of trendObs) {
    const s = seriesByType.get(o.type) ?? { values: [], latest: o.value, unit: o.unit };
    s.values.push(o.value);
    s.latest = o.value;
    s.unit = o.unit ?? s.unit;
    seriesByType.set(o.type, s);
  }
  const trends = TREND_ORDER.filter((t) => (seriesByType.get(t)?.values.length ?? 0) >= 2).map(
    (t) => ({ type: t, ...seriesByType.get(t)!, meta: METRIC_LABELS[t] })
  );

  return (
    <div className="px-4 pt-3">
      <header className="mb-3 flex items-center gap-1">
        <Link href="/" className="-ml-2 p-1.5 text-accent active:opacity-60">
          <ChevronLeft size={26} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold leading-tight tracking-tight">
            {patient.name}
          </h1>
          <Link
            href={`/patients/${patient.id}/edit`}
            className="flex items-center gap-0.5 text-[13px] text-label2 active:opacity-60"
          >
            #{patient.fileNumber}
            {patient.phone ? ` · ${patient.phone}` : ""}
            <ChevronRight size={13} />
          </Link>
        </div>
        <Link
          href={`/patients/${patient.id}/visit/new`}
          className="rounded-full bg-accent px-4 py-2 text-[15px] font-semibold text-white active:opacity-80"
        >
          New visit
        </Link>
      </header>

      <MemoryCardView card={card} />

      <div className="mt-3">
        <StickyNoteEditor patientId={patient.id} note={patient.stickyNote} />
      </div>

      {trends.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-label2">
            Trends
          </h2>
          <div className="flex gap-2.5 overflow-x-auto pb-1 [-webkit-overflow-scrolling:touch]">
            {trends.map((t) => (
              <div
                key={t.type}
                className="w-[124px] shrink-0 rounded-2xl bg-card p-3 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
              >
                <div className="text-[12px] font-medium text-label2">{t.meta.label}</div>
                <div className="text-[17px] font-semibold leading-tight">
                  {t.type === "BP_SYS"
                    ? `${t.latest.toFixed(0)}${seriesByType.get("BP_DIA") ? `/${seriesByType.get("BP_DIA")!.latest.toFixed(0)}` : ""}`
                    : t.latest.toFixed(t.meta.decimals)}
                  <span className="ml-1 text-[11px] font-normal text-label2">{t.unit}</span>
                </div>
                <div className="mt-1.5">
                  <Sparkline
                    points={t.values.slice(-8)}
                    higherIsWorse={t.meta.higherIsWorse}
                    minDelta={t.meta.minDelta}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {patient.tasks.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-label2">
            Pending
          </h2>
          <div className="ios-list overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {patient.tasks.map((t) => {
              const overdue = t.dueDate && t.dueDate < new Date();
              return (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <span className="flex items-center gap-2.5 text-[15px]">
                    {t.kind === "FOLLOW_UP" ? (
                      <RefreshCw size={15} className="text-label2" />
                    ) : (
                      <FlaskConical size={15} className="text-label2" />
                    )}
                    {t.title}
                  </span>
                  {t.dueDate && (
                    <span
                      className={`text-[13px] ${overdue ? "font-medium text-ios-red" : "text-label2"}`}
                    >
                      {overdue ? `overdue · ${relDay(t.dueDate)}` : `due ${relDay(t.dueDate)}`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-6">
        <div className="mb-2 flex items-baseline justify-between px-4">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-label2">Reports</h2>
          <Link
            href={`/patients/${patient.id}/report/new`}
            className="text-[13px] font-semibold text-accent active:opacity-60"
          >
            + Add
          </Link>
        </div>
        {patient.reports.length > 0 ? (
          <div className="ios-list overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {patient.reports.map((r) => {
              const Icon =
                r.kind === "imaging" ? ImageIcon : r.kind === "outside_rx" ? Pill : FileText;
              const row = (
                <div className="flex items-center gap-3 px-4 py-3">
                  <Icon size={18} className="shrink-0 text-label2" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px]">{r.title}</div>
                    {r.summary && (
                      <div className="truncate text-[13px] text-label2">{r.summary}</div>
                    )}
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5 text-[13px] text-label2">
                    {r.fileName && <Paperclip size={13} />}
                    {relDay(r.reportDate)}
                  </span>
                </div>
              );
              return r.fileName ? (
                <a
                  key={r.id}
                  href={`/api/reports/${r.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block active:bg-black/5"
                >
                  {row}
                </a>
              ) : (
                <div key={r.id}>{row}</div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 text-[13px] text-label2">
            No reports yet — add outside labs so trends stay complete.
          </p>
        )}
      </section>

      <section className="mt-6 pb-6">
        <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-label2">
          Timeline
        </h2>
        <ol className="space-y-3">
          {patient.visits.map((v) => (
            <li
              key={v.id}
              className="rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-semibold">{shortDate(v.visitDate)}</span>
                <span className="text-[13px] text-label2">{relDay(v.visitDate)}</span>
              </div>
              {v.complaint && <p className="mt-1 text-[15px]">{v.complaint}</p>}
              {v.diagnosis && (
                <p className="mt-0.5 text-[13px] font-medium text-label2">Dx: {v.diagnosis}</p>
              )}
              {v.observations.length > 0 && (
                <p className="mt-1 text-[13px] text-label2">
                  {v.observations
                    .filter((o) => o.type !== "BP_DIA")
                    .map((o) => {
                      if (o.type === "BP_SYS") {
                        const dia = v.observations.find((d) => d.type === "BP_DIA");
                        return `BP ${o.value}/${dia?.value ?? "?"}`;
                      }
                      return `${o.type.replace("_", " ")} ${o.value}${o.unit ?? ""}`;
                    })
                    .join(" · ")}
                </p>
              )}
              {v.prescription && v.prescription.items.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {v.prescription.items.map((item) => (
                    <span
                      key={item.id}
                      className="rounded-lg bg-fillinput px-2 py-1 text-[12px] text-label"
                    >
                      {item.drugName.replace(/^(Tab|Cap|Syp|Inh|Gel) /, "")} {item.frequency}
                    </span>
                  ))}
                  <Link
                    href={`/visits/${v.id}/rx`}
                    className="ml-auto flex items-center text-[13px] font-medium text-accent active:opacity-60"
                  >
                    View Rx <ChevronRight size={14} />
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
