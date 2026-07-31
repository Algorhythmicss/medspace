import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { db } from "@/lib/db";
import SearchBox from "@/components/SearchBox";
import LockButton from "@/components/LockButton";
import { relDay, patientAgeSex } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 86400000);

  const [clinic, overdueCount, dueTodayTasks, recentPatients] = await Promise.all([
    db.clinic.findUnique({ where: { id: "clinic" } }),
    db.carePlanTask.count({
      where: { status: "pending", dueDate: { lt: todayStart } },
    }),
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

  return (
    <div className="px-4 pt-4">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-label2">
            {clinic?.clinicName} · {clinic?.doctorName}
          </p>
          <h1 className="text-[34px] font-bold leading-tight tracking-tight">Today</h1>
        </div>
        <div className="pt-1">
          <LockButton />
        </div>
      </header>

      <SearchBox />

      {overdueCount > 0 && (
        <Link
          href="/followups"
          className="mt-4 flex items-center justify-between rounded-2xl bg-card px-4 py-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:opacity-70"
        >
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ios-red text-[13px] font-bold text-white">
              {overdueCount}
            </span>
            <span className="text-[17px]">Overdue follow-ups</span>
          </div>
          <ChevronRight size={18} className="text-label2" />
        </Link>
      )}

      {dueTodayTasks.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-label2">
            Due today
          </h2>
          <div className="ios-list overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            {dueTodayTasks.map((t) => (
              <Link
                key={t.id}
                href={`/patients/${t.patient.id}`}
                className="flex items-center justify-between px-4 py-3 active:bg-black/5"
              >
                <span className="text-[17px]">{t.patient.name}</span>
                <span className="flex items-center gap-1 text-[15px] text-label2">
                  {t.title}
                  <ChevronRight size={16} />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-6">
        <h2 className="mb-2 px-4 text-[13px] font-medium uppercase tracking-wide text-label2">
          Recent patients
        </h2>
        <div className="ios-list overflow-hidden rounded-2xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          {recentPatients.map((p) => (
            <Link
              key={p.id}
              href={`/patients/${p.id}`}
              className="flex items-center gap-3 px-4 py-3 active:bg-black/5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[15px] font-semibold text-accent">
                {p.name
                  .split(" ")
                  .slice(0, 2)
                  .map((w) => w[0])
                  .join("")}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[17px] leading-snug">{p.name}</div>
                <div className="truncate text-[13px] text-label2">
                  {[patientAgeSex(p), p.conditions.map((c) => c.name).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <span className="shrink-0 text-[13px] text-label2">
                {p.visits[0] ? relDay(p.visits[0].visitDate) : "new"}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
