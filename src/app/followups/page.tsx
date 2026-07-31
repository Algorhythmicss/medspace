import Link from "next/link";
import { FlaskConical, RefreshCw } from "lucide-react";
import { db } from "@/lib/db";
import { relDay, shortDate } from "@/lib/format";
import TaskActions from "@/components/TaskActions";

export const dynamic = "force-dynamic";

export default async function FollowUps() {
  const now = new Date();
  const [clinic, tasks] = await Promise.all([
    db.clinic.findUnique({ where: { id: "clinic" } }),
    db.carePlanTask.findMany({
      where: { status: "pending", dueDate: { not: null } },
      orderBy: { dueDate: "asc" },
      include: { patient: true },
    }),
  ]);

  const overdue = tasks.filter((t) => t.dueDate! < now);
  const upcoming = tasks.filter((t) => t.dueDate! >= now);

  // group overdue by patient — one conversation per patient, not per task
  const byPatient = new Map<string, { patient: (typeof tasks)[number]["patient"]; tasks: typeof tasks }>();
  for (const t of overdue) {
    if (!byPatient.has(t.patientId)) byPatient.set(t.patientId, { patient: t.patient, tasks: [] });
    byPatient.get(t.patientId)!.tasks.push(t);
  }

  return (
    <div className="px-4 pt-4">
      <header className="mb-4">
        <h1 className="text-[34px] font-bold leading-tight tracking-tight">Follow-ups</h1>
        <p className="text-[13px] text-label2">
          Overdue patients first — they are the ones who drift away.
        </p>
      </header>

      {byPatient.size === 0 && upcoming.length === 0 && (
        <p className="py-12 text-center text-[15px] text-label2">Nothing pending.</p>
      )}

      {byPatient.size > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-ios-red">
            Overdue · {byPatient.size} patient{byPatient.size > 1 ? "s" : ""}
          </h2>
          <ul className="space-y-3">
            {[...byPatient.values()].map(({ patient, tasks: patientTasks }) => {
              const worst = patientTasks[0];
              const reminderText = [
                `Namaste ${patient.name} ji, this is a reminder from ${clinic?.clinicName ?? "the clinic"} (${clinic?.doctorName ?? ""}).`,
                ...patientTasks.map((t) =>
                  t.kind === "FOLLOW_UP"
                    ? `Your follow-up visit was due on ${shortDate(t.dueDate!)}. Please visit the clinic.`
                    : `Your test "${t.title}" is pending. Please get it done before your next visit.`
                ),
                `Please reply here or call to book a time. 🙏`,
              ].join("\n");
              const waHref = patient.phone
                ? `https://wa.me/91${patient.phone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(reminderText)}`
                : null;

              return (
                <li
                  key={patient.id}
                  className="rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                >
                  <Link
                    href={`/patients/${patient.id}`}
                    className="flex items-baseline justify-between active:opacity-60"
                  >
                    <span className="text-[17px] font-semibold">{patient.name}</span>
                    <span className="text-[13px] font-medium text-ios-red">
                      {relDay(worst.dueDate!)}
                    </span>
                  </Link>
                  <ul className="mt-1.5 space-y-1">
                    {patientTasks.map((t) => (
                      <li key={t.id} className="flex items-center gap-2 text-[13px] text-label2">
                        {t.kind === "FOLLOW_UP" ? (
                          <RefreshCw size={12} />
                        ) : (
                          <FlaskConical size={12} />
                        )}
                        {t.title}
                      </li>
                    ))}
                  </ul>
                  <TaskActions
                    waHref={waHref}
                    phone={patient.phone}
                    taskIds={patientTasks.map((t) => t.id)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="pb-6">
          <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-label2">
            Coming up
          </h2>
          <div className="ios-list overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {upcoming.map((t) => (
              <Link
                key={t.id}
                href={`/patients/${t.patientId}`}
                className="flex items-center justify-between px-4 py-3 active:bg-black/5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="shrink-0 text-label2">
                    {t.kind === "FOLLOW_UP" ? <RefreshCw size={15} /> : <FlaskConical size={15} />}
                  </span>
                  <span className="truncate text-[15px]">
                    <span className="font-medium">{t.patient.name}</span>
                    <span className="text-label2"> · {t.title}</span>
                  </span>
                </div>
                <span className="shrink-0 text-[13px] text-label2">{relDay(t.dueDate!)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
