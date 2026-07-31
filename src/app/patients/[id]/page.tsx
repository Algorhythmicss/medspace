import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FlaskConical,
  RefreshCw,
  FileText,
  Paperclip,
  Plus,
} from "lucide-react";
import { headers } from "next/headers";
import { ArtSpot } from "@/components/Art";
import SendPlanLink from "@/components/SendPlanLink";
import LinkedAccounts from "@/components/LinkedAccounts";
import { createPatientToken } from "@/lib/patientLink";
import { accessForPatient } from "@/lib/patientAccess";
import { waLink, telLink } from "@/lib/phone";
import { planReach } from "@/lib/reach";
import { db } from "@/lib/db";
import { buildMemoryCard } from "@/lib/memory";
import Briefing from "@/components/Briefing";
import { relDay, shortDate } from "@/lib/format";

export const dynamic = "force-dynamic";

const VISIBLE_VISITS = 3;

export default async function PatientChart({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ all?: string }>;
}) {
  const { id } = await params;
  const { all } = await searchParams;

  const [patient, card, clinic] = await Promise.all([
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
        // never select fileData here — it would pull attachment bytes into the page
        reports: {
          orderBy: { reportDate: "desc" },
          take: 5,
          select: { id: true, title: true, kind: true, reportDate: true, summary: true, fileName: true },
        },
      },
    }),
    buildMemoryCard(id),
    db.clinic.findUnique({ where: { id: "clinic" } }),
  ]);
  if (!patient || !card) notFound();

  const linkedAccounts = await accessForPatient(id);

  // The patient's own plan link, ready to send from this chart.
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;
  const planUrl = `${origin}/p/${await createPatientToken(patient.id, undefined, patient.linkVersion)}`;
  const planMessage = [
    `Namaste ${patient.name} ji, this is ${clinic?.clinicName ?? "the clinic"}.`,
    `Your medicines, tests and next visit are here: ${planUrl}`,
  ].join("\n");

  const showAll = all === "1";
  const visits = showAll ? patient.visits : patient.visits.slice(0, VISIBLE_VISITS);
  const hidden = patient.visits.length - visits.length;
  const now = new Date();

  return (
    <div className="pt-3 lg:pt-6">
      <header className="mb-3 flex items-center justify-between">
        <Link
          href="/"
          aria-label="Back"
          className="-ml-2 rounded-full p-2 text-ink3 transition-opacity active:opacity-60"
        >
          <ChevronLeft size={24} />
        </Link>
        <Link
          href={`/patients/${patient.id}/edit`}
          className="t-cap rounded-full px-3 py-1.5 font-medium text-ink3 transition-opacity active:opacity-60"
        >
          Edit details
        </Link>
      </header>

      <Briefing
        card={card}
        patientId={patient.id}
        note={patient.stickyNote}
        name={patient.name}
        fileNumber={patient.fileNumber}
      />

      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      {/* the rail: what to do next, and what is owed — stays put while
          history scrolls on a laptop */}
      <div className="lg:sticky lg:top-6 lg:order-2 lg:col-span-5 lg:space-y-5">
      <Link
        href={`/patients/${patient.id}/visit/new`}
        className="btn btn-primary mt-4 block w-full py-4 text-center text-[16.5px] lg:mt-0"
      >
        Start a visit
      </Link>

      <SendPlanLink
        waHref={waLink(patient.phone, planMessage)}
        telHref={telLink(patient.phone)}
        planUrl={planUrl}
        patientId={patient.id}
        reach={planReach(patient)}
      />

      <LinkedAccounts
        access={linkedAccounts.map((a) => ({
          id: a.id,
          email: a.email,
          status: a.status,
          boundAt: a.boundAt.toISOString(),
          lastUsedAt: a.lastUsedAt ? a.lastUsedAt.toISOString() : null,
        }))}
      />

      {/* ── open items: what is owed, in one place ───────────── */}
      {(patient.tasks.length > 0 || patient.reports.length > 0) && (
        <section className="mt-6">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="label">Open items</h2>
            <Link
              href={`/patients/${patient.id}/report/new`}
              className="t-cap inline-flex items-center gap-0.5 font-semibold text-peri active:opacity-60"
            >
              <Plus size={13} strokeWidth={2.5} /> Report
            </Link>
          </div>

          <div className="card rows overflow-hidden">
            {patient.tasks.map((t) => {
              const overdue = t.dueDate && t.dueDate < now;
              return (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <span className={overdue ? "text-coral" : "text-ink3"}>
                    {t.kind === "FOLLOW_UP" ? (
                      <RefreshCw size={15} />
                    ) : (
                      <FlaskConical size={15} />
                    )}
                  </span>
                  <span className="t-body min-w-0 flex-1 truncate">{t.title}</span>
                  {t.dueDate && (
                    <span
                      className={`shrink-0 text-[12.5px] ${overdue ? "font-medium text-coral" : "text-ink3"}`}
                    >
                      {overdue ? relDay(t.dueDate) : `due ${relDay(t.dueDate)}`}
                    </span>
                  )}
                </div>
              );
            })}

            {patient.reports.map((r) => {
              const row = (
                <>
                  <span className="text-ink3">
                    {r.fileName ? <Paperclip size={15} /> : <FileText size={15} />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="t-body block truncate">{r.title}</span>
                    {r.summary && (
                      <span className="t-micro block truncate text-ink3">{r.summary}</span>
                    )}
                  </span>
                  <span className="t-micro shrink-0 text-ink3">
                    {relDay(r.reportDate)}
                  </span>
                </>
              );
              return r.fileName ? (
                <a
                  key={r.id}
                  href={`/api/reports/${r.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-4 py-3 transition-colors active:bg-sunk"
                >
                  {row}
                </a>
              ) : (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  {row}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {patient.tasks.length === 0 && patient.reports.length === 0 && (
        <section className="mt-6">
          <div className="card flex items-center justify-between px-4 py-3.5">
            <span className="t-body text-ink3">Nothing pending — records are current.</span>
            <Link
              href={`/patients/${patient.id}/report/new`}
              className="t-cap inline-flex items-center gap-0.5 font-semibold text-peri active:opacity-60"
            >
              <Plus size={13} strokeWidth={2.5} /> Report
            </Link>
          </div>
        </section>
      )}

      </div>

      {/* ── history ──────────────────────────────────────────── */}
      <section className="mt-6 pb-8 lg:order-1 lg:col-span-7 lg:mt-4">
        <h2 className="label mb-2 px-1">History</h2>
        <ol className="space-y-2.5">
          {visits.map((v) => (
            <li key={v.id} className="card p-4">
              <div className="flex items-baseline justify-between gap-2">
                <span className="t-head">
                  {shortDate(v.visitDate)}
                </span>
                <span className="t-micro shrink-0 text-ink3">{relDay(v.visitDate)}</span>
              </div>
              {v.complaint && <p className="t-body mt-1">{v.complaint}</p>}
              {v.diagnosis && (
                <p className="t-cap mt-0.5 text-ink2">{v.diagnosis}</p>
              )}
              {v.observations.length > 0 && (
                <p className="t-micro tnum mt-1.5 text-ink3">
                  {v.observations
                    .filter((o) => o.type !== "BP_DIA")
                    .map((o) => {
                      if (o.type === "BP_SYS") {
                        const dia = v.observations.find((d) => d.type === "BP_DIA");
                        return `BP ${o.value}/${dia?.value ?? "?"}`;
                      }
                      return `${o.type.replace("_", " ")} ${o.value}${o.unit ?? ""}`;
                    })
                    .join("   ")}
                </p>
              )}
              {v.prescription && v.prescription.items.length > 0 && (
                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {v.prescription.items.map((item) => (
                    <span
                      key={item.id}
                      className="t-micro rounded-lg bg-sunk px-2 py-1 text-ink2"
                    >
                      {item.drugName.replace(/^(Tab|Cap|Syp|Inh|Gel) /, "")}{" "}
                      <span className="tnum text-ink3">{item.frequency}</span>
                    </span>
                  ))}
                  <Link
                    href={`/visits/${v.id}/rx`}
                    className="t-micro ml-auto inline-flex items-center font-semibold text-peri active:opacity-60"
                  >
                    Rx <ChevronRight size={13} />
                  </Link>
                </div>
              )}
            </li>
          ))}
        </ol>

        {hidden > 0 && (
          <Link
            href={`/patients/${patient.id}?all=1`}
            className="t-body mt-3 block rounded-2xl border border-hairline py-3 text-center font-medium text-ink2 transition-colors active:bg-sunk"
          >
            Show {hidden} earlier visit{hidden > 1 ? "s" : ""}
          </Link>
        )}
      </section>
      </div>
    </div>
  );
}
