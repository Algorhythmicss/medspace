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
    <div className="px-4 pt-5">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] text-ink3">{greeting(now.getHours())}</p>
          <h1 className="font-display text-[30px] font-bold leading-tight tracking-[-0.025em]">
            {shortName ?? "Today"}
          </h1>
        </div>
        <div className="pt-1.5">
          <LockButton />
        </div>
      </header>

      <SearchBox />

      {/* The single most valuable thing on this screen: who is drifting away. */}
      {overdueCount > 0 && (
        <Link
          href="/followups"
          className="card mt-4 flex items-center gap-3.5 px-4 py-4 transition-colors active:bg-sunk"
        >
          <span className="tnum flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-alertsoft font-display text-[17px] font-bold text-alert">
            {overdueCount}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-medium">Waiting on follow-up</span>
            <span className="block text-[13px] text-ink3">
              Overdue patients drift to another clinic
            </span>
          </span>
          <ChevronRight size={17} className="shrink-0 text-ink3" />
        </Link>
      )}

      {dueTodayTasks.length > 0 && (
        <section className="mt-6">
          <h2 className="label mb-2 px-1">Expected today</h2>
          <div className="card rows overflow-hidden">
            {dueTodayTasks.map((t) => (
              <Link
                key={t.id}
                href={`/patients/${t.patient.id}`}
                className="flex items-center gap-3 px-4 py-3.5 transition-colors active:bg-sunk"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[16px]">{t.patient.name}</span>
                  <span className="block truncate text-[13px] text-ink3">{t.title}</span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-ink3" />
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="label mb-2 px-1">Recently seen</h2>
        <div className="card rows overflow-hidden">
          {recentPatients.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex items-center gap-3.5 px-4 py-3 transition-colors active:bg-sunk"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primarysoft font-display text-[14px] font-semibold text-primary">
                {p.name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] leading-snug">{p.name}</span>
                <span className="block truncate text-[13px] text-ink3">
                  {[patientAgeSex(p), p.conditions.map((c) => c.name).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-[12.5px] text-ink3">
                {p.visits[0] ? relDay(p.visits[0].visitDate) : "new"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
