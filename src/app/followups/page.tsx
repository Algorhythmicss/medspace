import Link from "next/link";
import {
  FlaskConical,
  MessageCircle,
  Phone,
  RefreshCw,
  UserX,
} from "lucide-react";
import { ArtSpot } from "@/components/Art";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { createPatientToken } from "@/lib/patientLink";
import { relDay, shortDate } from "@/lib/format";
import { waLink, telLink } from "@/lib/phone";
import { planReach } from "@/lib/reach";
import { findChronicDrifters, DRIFT_MONTHS } from "@/lib/recall";
import TaskActions from "@/components/TaskActions";
import RecallActions from "@/components/RecallActions";

export const dynamic = "force-dynamic";

export default async function FollowUps() {
  const now = new Date();
  const [clinic, tasks, drifters] = await Promise.all([
    db.clinic.findUnique({ where: { id: "clinic" } }),
    db.carePlanTask.findMany({
      where: { status: "pending", dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
      include: { patient: true },
    }),
    findChronicDrifters(now),
  ]);

  // Absolute origin so the link works when it lands in WhatsApp.
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:3000"}`;

  // One signed link per patient, generated alongside the message.
  const linkFor = new Map<string, string>();
  const addLink = async (patientId: string, linkVersion: number) => {
    if (!linkFor.has(patientId)) {
      linkFor.set(patientId, `${origin}/p/${await createPatientToken(patientId, undefined, linkVersion)}`);
    }
  };
  for (const t of tasks) await addLink(t.patientId, t.patient.linkVersion);
  for (const d of drifters) await addLink(d.id, d.linkVersion);

  const overdue = tasks.filter((t) => t.dueDate! < now);
  const upcoming = tasks.filter((t) => t.dueDate! >= now);

  // group overdue by patient — one conversation per patient, not per task
  const byPatient = new Map<string, { patient: (typeof tasks)[number]["patient"]; tasks: typeof tasks }>();
  for (const t of overdue) {
    if (!byPatient.has(t.patientId)) byPatient.set(t.patientId, { patient: t.patient, tasks: [] });
    byPatient.get(t.patientId)!.tasks.push(t);
  }

  const overduePatients = [...byPatient.values()]
    .map((group) => {
      const reach = planReach(group.patient, now);
      return {
        ...group,
        reach,
        callFirst: reach.callFirst && Boolean(telLink(group.patient.phone)),
      };
    })
    .sort((a, b) => {
      if (a.callFirst !== b.callFirst) return a.callFirst ? -1 : 1;
      return a.tasks[0].dueDate!.getTime() - b.tasks[0].dueDate!.getTime();
    });
  const driftersWithReach = drifters.map((patient) => {
    const reach = planReach(patient, now);
    return {
      patient,
      reach,
      callFirst: reach.callFirst && Boolean(telLink(patient.phone)),
    };
  });
  const callFirstCount =
    overduePatients.filter((group) => group.callFirst).length +
    driftersWithReach.filter((group) => group.callFirst).length;
  const messageFirstCount =
    overduePatients.filter((group) => !group.callFirst).length +
    driftersWithReach.filter((group) => !group.callFirst).length;

  return (
    <div className="pt-4">
      <header className="mb-5">
        <p className="t-cap text-ink3">Bringing people back</p>
        <h1 className="t-hero">
          Follow-ups
        </h1>
      </header>

      {(byPatient.size > 0 || drifters.length > 0) && (
        <section className="card mb-6 grid grid-cols-3 overflow-hidden">
          <div className="p-4">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-coralsoft text-coral">
              <Phone size={15} strokeWidth={2.3} />
            </span>
            <p className="t-num t-title">{callFirstCount}</p>
            <p className="t-cap text-ink3">Call first</p>
          </div>
          <div className="border-l border-hairline p-4">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-jadesoft text-jade">
              <MessageCircle size={15} strokeWidth={2.3} />
            </span>
            <p className="t-num t-title">{messageFirstCount}</p>
            <p className="t-cap text-ink3">Message / review</p>
          </div>
          <div className="border-l border-hairline p-4">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-xl bg-buttersoft text-butter">
              <UserX size={15} strokeWidth={2.3} />
            </span>
            <p className="t-num t-title">{drifters.length}</p>
            <p className="t-cap text-ink3">Fell off the plan</p>
          </div>
        </section>
      )}

      {byPatient.size === 0 && upcoming.length === 0 && drifters.length === 0 && (
        <div className="py-10 text-center">
          <ArtSpot name="discharge" className="mb-5" />
          <p className="t-head">Everyone is up to date</p>
          <p className="t-cap mx-auto mt-1 max-w-[280px] text-ink3">
            No follow-ups are overdue. Patients you see today will appear here when
            their next visit falls due.
          </p>
        </div>
      )}

      {byPatient.size > 0 && (
        <section className="mb-6">
          <h2 className="label mb-2 px-1">
            Overdue · {byPatient.size} patient{byPatient.size > 1 ? "s" : ""}
          </h2>
          <ul className="stagger space-y-3">
            {overduePatients.map(({ patient, tasks: patientTasks, reach, callFirst }) => {
              const worst = patientTasks[0];
              const reminderText = [
                `Namaste ${patient.name} ji, this is a reminder from ${clinic?.clinicName ?? "the clinic"} (${clinic?.doctorName ?? ""}).`,
                ...patientTasks.map((t) =>
                  t.kind === "FOLLOW_UP"
                    ? `Your follow-up visit was due on ${shortDate(t.dueDate!)}. Please visit the clinic.`
                    : `Your test "${t.title}" is pending. Please get it done before your next visit.`
                ),
                `Your medicines, tests and next visit are here: ${linkFor.get(patient.id)}`,
                `Please reply here or call to book a time. 🙏`,
              ].join("\n");
              const waHref = waLink(patient.phone, reminderText);
              return (
                <li
                  key={patient.id}
                  className="card p-4"
                >
                  <Link
                    href={`/patients/${patient.id}`}
                    className="flex items-baseline justify-between active:opacity-60"
                  >
                    <span className="t-head">{patient.name}</span>
                    <span className="t-cap font-semibold text-coral">
                      {relDay(worst.dueDate!)}
                    </span>
                  </Link>
                  <ul className="mt-1.5 space-y-1">
                    {patientTasks.map((t) => (
                      <li key={t.id} className="t-cap flex items-center gap-2 text-ink2">
                        {t.kind === "FOLLOW_UP" ? (
                          <RefreshCw size={12} />
                        ) : (
                          <FlaskConical size={12} />
                        )}
                        {t.title}
                      </li>
                    ))}
                  </ul>
                  {/* Whether the channel works for this person, said once and
                      quietly — it decides whether to message or to phone. */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`t-micro inline-flex items-center gap-1 rounded-full px-2 py-1 font-semibold ${
                        callFirst
                          ? "bg-coralsoft text-coral"
                          : "bg-jadesoft text-jade"
                      }`}
                    >
                      {callFirst ? <Phone size={11} /> : <MessageCircle size={11} />}
                      {callFirst ? "Call first" : "Message / review"}
                    </span>
                    <p
                      className={`t-micro ${
                        reach.tone === "ok"
                          ? "text-jade"
                          : reach.tone === "warn"
                            ? "text-butter"
                            : "text-ink3"
                      }`}
                    >
                      {reach.label}
                    </p>
                  </div>
                  <TaskActions
                    waHref={waHref}
                    telHref={telLink(patient.phone)}
                    taskIds={patientTasks.map((t) => t.id)}
                    patientId={patient.id}
                    reach={reach}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {drifters.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 px-1">
            <h2 className="label">
              Haven’t been back · {drifters.length}
            </h2>
            <p className="t-micro mt-0.5 text-ink3">
              Chronic patients with nothing scheduled and no visit in {DRIFT_MONTHS}+ months.
            </p>
          </div>
          <ul className="stagger space-y-3">
            {driftersWithReach.map(({ patient: d, reach }) => {
              const recallText = [
                `Namaste ${d.name} ji, this is ${clinic?.clinicName ?? "the clinic"}${clinic?.doctorName ? ` (${clinic.doctorName})` : ""}.`,
                d.conditions.length > 0
                  ? `It's been a while since your last visit for ${d.conditions.slice(0, 2).join(" and ")}. A check-up is due — please come by when you can.`
                  : `It's been a while since your last visit. A check-up is due — please come by when you can.`,
                `Your medicines and details are here: ${linkFor.get(d.id)}`,
                `Reply here or call to book a time. 🙏`,
              ].join("\n");
              const waHref = waLink(d.phone, recallText);

              return (
                <li key={d.id} className="card p-4">
                  <Link
                    href={`/patients/${d.id}`}
                    className="flex items-baseline justify-between active:opacity-60"
                  >
                    <span className="t-head">{d.name}</span>
                    <span className="t-cap font-semibold text-butter">
                      {d.lastVisit ? `last seen ${relDay(d.lastVisit, now)}` : "never visited"}
                    </span>
                  </Link>
                  {d.conditions.length > 0 && (
                    <p className="t-cap mt-1 flex items-center gap-2 text-ink2">
                      <UserX size={12} className="shrink-0" />
                      {d.conditions.join(" · ")}
                    </p>
                  )}
                  <p
                    className={`t-micro mt-2 ${
                      reach.tone === "ok"
                        ? "text-jade"
                        : reach.tone === "warn"
                          ? "text-butter"
                          : "text-ink3"
                    }`}
                  >
                    {reach.label}
                  </p>
                  <RecallActions
                    waHref={waHref}
                    telHref={telLink(d.phone)}
                    patientId={d.id}
                    reach={reach}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="pb-6">
          <h2 className="label mb-2 px-1">Coming up</h2>
          <div className="rows overflow-hidden rounded-2xl bg-surface shadow-[var(--lift)]">
            {upcoming.map((t) => (
              <Link
                key={t.id}
                href={`/patients/${t.patientId}`}
                className="flex items-center justify-between px-4 py-3 active:bg-black/5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0 text-ink2">
                    {t.kind === "FOLLOW_UP" ? <RefreshCw size={15} /> : <FlaskConical size={15} />}
                  </span>
                  <span className="t-body truncate">
                    <span className="font-medium">{t.patient.name}</span>
                    <span className="text-ink2"> · {t.title}</span>
                  </span>
                </div>
                <span className="shrink-0 text-[13px] text-ink2">{relDay(t.dueDate!)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
