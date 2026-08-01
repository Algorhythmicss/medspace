import Link from "next/link";
import type { Metadata } from "next";
import { Users } from "lucide-react";
import { db } from "@/lib/db";
import { relDay, patientAgeSex } from "@/lib/format";
import { hasStaffSession } from "@/lib/session";
import { staffSignOut } from "@/app/actions";
import QueueDesk from "@/components/QueueDesk";
import { RemoveFromQueue } from "@/components/QueueControls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Front desk",
  robots: { index: false, follow: false },
};

// The front-desk queue. Staff add whoever walks in; the doctor sees the list on
// their Today screen. Deliberately a walk-in list, not a booking calendar.
export default async function QueueScreen() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [clinic, waiting, staff] = await Promise.all([
    db.clinic.findUnique({ where: { id: "clinic" } }),
    db.queueEntry.findMany({
      where: { status: "waiting", arrivedAt: { gte: todayStart } },
      orderBy: { arrivedAt: "asc" },
      include: {
        patient: { select: { id: true, name: true, fileNumber: true, dob: true, ageYears: true, sex: true } },
      },
    }),
    hasStaffSession(),
  ]);

  return (
    <div className="py-5">
      <header className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="t-cap text-ink3">{clinic?.clinicName ?? "Front desk"}</p>
          <h1 className="t-hero">Today’s queue</h1>
        </div>
        {staff && (
          <form action={staffSignOut}>
            <button className="t-cap rounded-full px-3 py-1.5 font-medium text-ink3 active:opacity-60">
              Sign out
            </button>
          </form>
        )}
      </header>

      <QueueDesk />

      <section className="mt-6">
        <h2 className="label mb-2 px-1">
          Waiting · {waiting.length}
        </h2>
        {waiting.length === 0 ? (
          <div className="card flex items-center gap-3 px-4 py-6 text-ink3">
            <Users size={18} />
            <span className="t-body">No one waiting. Add a patient above as they arrive.</span>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {waiting.map((e, i) => (
              <li key={e.id} className="card flex items-center gap-3 p-4">
                <span className="t-num flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-perisoft text-[15px] text-peri">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="t-head block truncate">{e.patient.name}</span>
                  <span className="t-micro text-ink3">
                    #{e.patient.fileNumber}
                    {patientAgeSex(e.patient) ? ` · ${patientAgeSex(e.patient)}` : ""} · arrived{" "}
                    {relDay(e.arrivedAt)}
                  </span>
                </span>
                <RemoveFromQueue entryId={e.id} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {staff && (
        <p className="t-micro mt-6 px-2 text-center text-ink3">
          Front-desk view — patient records stay with the doctor.
        </p>
      )}

      {!staff && (
        <Link
          href="/"
          className="t-cap mt-6 block text-center font-semibold text-peri active:opacity-60"
        >
          ← Back to the clinic
        </Link>
      )}
    </div>
  );
}
