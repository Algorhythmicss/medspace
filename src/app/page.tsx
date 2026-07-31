import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import SearchBox from "@/components/SearchBox";
import LockButton from "@/components/LockButton";
import { relDay, patientAgeSex } from "@/lib/format";

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

  const [clinic, overdueCount, dueTodayTasks, recentPatients] = await Promise.all([
    db.clinic.findUnique({ where: { id: "clinic" } }),
    db.carePlanTask.count({ where: { status: "pending", dueDate: { lt: todayStart } } }),
    db.carePlanTask.findMany({
      where: { status: "pending", dueDate: { gte: todayStart, lt: todayEnd } },
      include: { patient: { select: { id: true, name: true } } },
    }),
    db.patient.findMany({
      orderBy: { updatedAt: "desc" },
      take: 6,
      include: {
        conditions: { where: { status: "active" }, select: { name: true } },
        visits: { orderBy: { visitDate: "desc" }, take: 1, select: { visitDate: true } },
      },
    }),
  ]);

  // "Dr. A. K. Verma" → "Dr. Verma", which is how a person would greet him
  const shortName = clinic?.doctorName?.replace(/^(Dr\.?)\s+.*?\s*(\S+)$/, "$1 $2");

  return (
    <div className="pt-5 lg:pt-8">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="t-cap font-medium text-ink3">{greeting(now.getHours())}</p>
          <h1 className="t-hero">
            {shortName ?? "Today"}
          </h1>
        </div>
        <div className="pt-1.5 lg:hidden">
          <LockButton />
        </div>
      </header>

      <SearchBox />

      <div className="lg:mt-6 lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
      <div className="lg:col-span-5 lg:space-y-6">
      {/* The single most valuable thing on this screen: who is drifting away. */}
      {overdueCount > 0 && (
        <Link
          href="/followups"
          className="hero mt-5 flex items-center gap-4 px-5 py-5 transition-transform active:scale-[0.99]"
        >
          <span className="t-num relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-[22px] text-white">
            {overdueCount}
          </span>
          <span className="relative min-w-0 flex-1">
            <span className="t-head block text-white">
              Waiting on you
            </span>
            <span className="t-cap block text-nightink2">
              Overdue patients drift to another clinic
            </span>
          </span>
          <ChevronRight size={20} className="relative shrink-0 text-nightink2" />
        </Link>
      )}

      {dueTodayTasks.length > 0 && (
        <section className="mt-6 lg:mt-0">
          <h2 className="label mb-2 px-1">Expected today</h2>
          <div className="card rows overflow-hidden">
            {dueTodayTasks.map((t) => (
              <Link
                key={t.id}
                href={`/patients/${t.patient.id}`}
                className="flex items-center gap-3 px-5 py-4 transition-opacity active:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="t-bodyL block">{t.patient.name}</span>
                  <span className="t-cap block truncate text-ink3">{t.title}</span>
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
          {recentPatients.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex items-center gap-3.5 px-5 py-3.5 transition-opacity active:opacity-60"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orangesoft t-head text-orange">
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
                {p.visits[0] ? relDay(p.visits[0].visitDate) : "new"}
              </span>
            </Link>
          ))}
        </div>
      </section>
      </div>
    </div>
  );
}
