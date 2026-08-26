import Link from "next/link";
import {
  Activity,
  ChevronRight,
  DoorOpen,
} from "lucide-react";
import { ArtBand } from "@/components/Art";
import { db } from "@/lib/db";
import SearchBox from "@/components/SearchBox";
import LockButton from "@/components/LockButton";
import { MarkSeen } from "@/components/QueueControls";
import { relDay, patientAgeSex } from "@/lib/format";
import { telLink } from "@/lib/phone";
import { planReach } from "@/lib/reach";
import { findChronicDrifters } from "@/lib/recall";
import { loadPracticePulse } from "@/lib/continuity";
import PracticePulse from "@/components/PracticePulse";

export const dynamic = "force-dynamic";

function greeting(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function Home() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [
    clinic,
    overdueTasks,
    dueTodayTasks,
    recentVisits,
    inClinic,
    drifters,
    pulse,
  ] = await Promise.all([
    db.clinic.findUnique({ where: { id: "clinic" } }),
    db.carePlanTask.findMany({
      where: { status: "pending", dueDate: { lt: todayStart } },
      select: {
        patientId: true,
        patient: {
          select: {
            planShareCount: true,
            planSharedAt: true,
            planOpenCount: true,
            planLastOpenedAt: true,
            planReplyKind: true,
            phone: true,
          },
        },
      },
    }),
    db.carePlanTask.findMany({
      where: { status: "pending", dueDate: { gte: todayStart, lt: todayEnd } },
      orderBy: { dueDate: "asc" },
      select: {
        id: true,
        title: true,
        patientId: true,
        patient: { select: { id: true, name: true } },
      },
    }),
    db.visit.findMany({
      orderBy: { visitDate: "desc" },
      take: 24,
      select: {
        visitDate: true,
        patient: {
          select: {
            id: true,
            name: true,
            dob: true,
            ageYears: true,
            sex: true,
            conditions: { where: { status: "active" }, select: { name: true } },
          },
        },
      },
    }),
    db.queueEntry.findMany({
      where: { status: "waiting", arrivedAt: { gte: todayStart } },
      orderBy: { arrivedAt: "asc" },
      select: {
        id: true,
        arrivedAt: true,
        note: true,
        bpSys: true,
        bpDia: true,
        pulse: true,
        weight: true,
        tempF: true,
        patient: { select: { id: true, name: true } },
      },
    }),
    findChronicDrifters(now),
    loadPracticePulse(now),
  ]);

  const overduePatients = new Map<string, (typeof overdueTasks)[number]["patient"]>();
  for (const task of overdueTasks) overduePatients.set(task.patientId, task.patient);
  const callFirstCount = [...overduePatients.values()].filter(
    (patient) => planReach(patient, now).callFirst && telLink(patient.phone)
  ).length;
  const attentionCount = overduePatients.size + drifters.length;

  const expectedByPatient = new Map<
    string,
    { patient: (typeof dueTodayTasks)[number]["patient"]; titles: string[] }
  >();
  for (const task of dueTodayTasks) {
    const current = expectedByPatient.get(task.patientId);
    if (current) current.titles.push(task.title);
    else expectedByPatient.set(task.patientId, { patient: task.patient, titles: [task.title] });
  }

  const recentPatients = [...new Map(
    recentVisits.map((visit) => [visit.patient.id, visit] as const)
  ).values()].slice(0, 6);

  // "Dr. A. K. Verma" → "Dr. Verma", which is how a person would greet him
  const shortName = clinic?.doctorName?.replace(/^(Dr\.?)\s+.*?\s*(\S+)$/, "$1 $2");

  return (
    <div className="pt-5 lg:pt-8">
      {/* The library leaves painted wall space for headings, so the greeting
          sits on the art instead of pushing search down the page — lookup is
          the ≤5s path and must stay near the top. */}
      <header className="relative mb-5 overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
        <ArtBand name="huddle" height="h-[156px] lg:h-[184px]" priority />
        <div className="absolute inset-0 bg-gradient-to-r from-[rgba(70,79,150,0.82)] via-[rgba(70,79,150,0.45)] to-transparent" />
        <div className="absolute inset-0 flex items-end justify-between gap-3 p-5">
          <div className="min-w-0">
            <p className="t-cap font-medium text-periink2">{greeting(now.getHours())}</p>
            <h1 className="t-title text-white">{shortName ?? "Today"}</h1>
          </div>
          <div className="lg:hidden">
            <LockButton />
          </div>
        </div>
      </header>

      <SearchBox />

      <div className="lg:mt-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      <div className="lg:col-span-5 lg:space-y-6">
      {/* Who is physically here right now — front-desk queue, most immediate. */}
      {inClinic.length > 0 && (
        <section className="mt-5 lg:mt-0">
          <div className="mb-2 flex items-baseline justify-between px-1">
            <h2 className="label inline-flex items-center gap-1.5">
              <DoorOpen size={13} /> In clinic now · {inClinic.length}
            </h2>
            <Link href="/queue" className="t-cap font-semibold text-peri active:opacity-60">
              Queue
            </Link>
          </div>
          <div className="card rows overflow-hidden">
            {inClinic.map((e, i) => {
              const vitalsReady =
                e.bpSys != null ||
                e.bpDia != null ||
                e.pulse != null ||
                e.weight != null ||
                e.tempF != null;
              return (
                <div key={e.id} className="flex items-center gap-3 px-4 py-3">
                  <span className="t-num flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-perisoft text-[14px] text-peri">
                    {i + 1}
                  </span>
                  <Link href={`/patients/${e.patient.id}`} className="min-w-0 flex-1 active:opacity-60">
                    <span className="t-bodyL block truncate">{e.patient.name}</span>
                    <span className="t-micro flex flex-wrap items-center gap-x-2 gap-y-0.5 text-ink3">
                      <span>
                        arrived {relDay(e.arrivedAt)}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 font-semibold ${
                          vitalsReady ? "text-jade" : "text-butter"
                        }`}
                      >
                        <Activity size={11} strokeWidth={2.4} />
                        {vitalsReady ? "Vitals ready" : "Vitals pending"}
                      </span>
                    </span>
                  </Link>
                  <MarkSeen entryId={e.id} />
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* The single most valuable thing on this screen: where continuity is
          about to break, reduced to one action-led summary. */}
      {attentionCount > 0 && (
        <Link
          href="/followups"
          className="hero pressable mt-5 flex items-center gap-4 px-5 py-5"
        >
          <span className="t-num relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-[22px] text-white">
            {attentionCount}
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="t-head block text-white">
              Continuity needs attention
            </span>
            <span className="t-cap block text-periink2">
              {[
                overduePatients.size > 0
                  ? `${overduePatients.size} overdue`
                  : null,
                drifters.length > 0
                  ? `${drifters.length} haven’t returned`
                  : null,
                callFirstCount > 0 ? `${callFirstCount} call first` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
          <ChevronRight size={20} className="relative shrink-0 text-periink2" />
        </Link>
      )}

      {expectedByPatient.size > 0 && (
        <section className="mt-6 lg:mt-0">
          <h2 className="label mb-2 px-1">Expected today</h2>
          <div className="card rows overflow-hidden">
            {[...expectedByPatient.values()].map(({ patient, titles }) => (
              <Link
                key={patient.id}
                href={`/patients/${patient.id}`}
                className="flex items-center gap-3 px-5 py-4 transition-opacity active:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="t-bodyL block">{patient.name}</span>
                  <span className="t-cap block truncate text-ink3">{titles.join(" · ")}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ink3" />
              </Link>
            ))}
          </div>
        </section>
      )}

      </div>

      <section className="mt-6 lg:col-span-7 lg:mt-0">
        <h2 className="label mb-2 px-1">Recently seen</h2>
        <div className="card rows overflow-hidden">
          {recentPatients.map(({ patient: p, visitDate }) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex items-center gap-3.5 px-5 py-3.5 transition-opacity active:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-perisoft t-head text-peri">
                {p.name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="t-bodyL block truncate">{p.name}</span>
                <span className="t-cap block truncate text-ink3">
                  {[patientAgeSex(p), p.conditions.map((c) => c.name).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="t-micro shrink-0 text-ink3">
                {relDay(visitDate)}
              </span>
            </Link>
          ))}
        </div>
      </section>
      </div>

      <PracticePulse pulse={pulse} />
    </div>
  );
}
