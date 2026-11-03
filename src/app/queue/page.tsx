import Link from "next/link";
import type { Metadata } from "next";
import { Activity, Clock3, FolderInput, Users } from "lucide-react";
import { db } from "@/lib/db";
import { relDay, patientAgeSex } from "@/lib/format";
import { hasStaffSession, hasClinicSession } from "@/lib/session";
import { liveClinicEnabled } from "@/lib/live-clinic-server";
import LiveQueue from "@/components/live/LiveQueue";
import { staffSignOut } from "@/app/actions";
import QueueDesk from "@/components/QueueDesk";
import QueueVitals from "@/components/QueueVitals";
import { RemoveFromQueue } from "@/components/QueueControls";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Front desk",
  robots: { index: false, follow: false },
};

// The front-desk queue. Staff add whoever walks in; the doctor sees the list on
// their Today screen. Deliberately a walk-in list, not a booking calendar.
export default async function QueueScreen() {
  if (liveClinicEnabled()) {
    const [clinic,doctor] = await Promise.all([db.clinic.findUnique({where:{id:"clinic"},select:{clinicName:true}}),hasClinicSession()]);
    return <div className="py-5"><header className="mb-5 flex items-start justify-between gap-3"><div><p className="t-cap text-ink3">{clinic?.clinicName??"Clinic"}</p><h1 className="t-hero">Front desk</h1><p className="t-cap mt-1 text-ink3">Check patients in as they arrive. The doctor and patient see the queue update.</p></div>{!doctor?<form action={staffSignOut}><button className="t-cap min-h-11 px-2 text-ink3">Sign out</button></form>:null}</header><LiveQueue role={doctor?"doctor":"staff"}/>{doctor?<Link href="/" className="t-cap mt-5 inline-flex min-h-11 items-center text-peri">Back to the clinic</Link>:<p className="t-micro mt-5 text-center text-ink3">Staff view · clinical records stay with the doctor.</p>}</div>;
  }
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
  const readyCount = waiting.filter(
    (entry) =>
      entry.bpSys != null ||
      entry.bpDia != null ||
      entry.pulse != null ||
      entry.weight != null ||
      entry.tempF != null
  ).length;

  return (
    <div className="py-5">
      <header className="mb-5 flex items-baseline justify-between">
        <div>
          <p className="t-cap text-ink3">{clinic?.clinicName ?? "Front desk"}</p>
          <h1 className="t-hero">Today’s queue</h1>
          <p className="t-cap mt-1 max-w-[360px] text-ink3">
            Find them, note why they came, and take vitals. The doctor gets a
            consult-ready handoff.
          </p>
        </div>
        {staff && (
          <form action={staffSignOut}>
            <button className="t-cap rounded-full px-3 py-1.5 font-medium text-ink3 active:opacity-60">
              Sign out
            </button>
          </form>
        )}
      </header>

      <div className="mb-4 flex gap-2">
        <span className="t-cap inline-flex items-center gap-1.5 rounded-full bg-perisoft px-3 py-1.5 font-semibold text-peri">
          <Clock3 size={13} strokeWidth={2.3} /> {waiting.length} waiting
        </span>
        <span className="t-cap inline-flex items-center gap-1.5 rounded-full bg-jadesoft px-3 py-1.5 font-semibold text-jade">
          <Activity size={13} strokeWidth={2.3} /> {readyCount} ready
        </span>
      </div>

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
          <ul className="stagger space-y-2.5">
            {waiting.map((e, i) => (
              <li key={e.id} className="card p-4">
                <div className="flex items-center gap-3">
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
                    {e.note && <span className="t-cap mt-0.5 block truncate text-ink2">{e.note}</span>}
                  </span>
                  <RemoveFromQueue entryId={e.id} />
                </div>
                <QueueVitals
                  entryId={e.id}
                  vitals={{
                    bpSys: e.bpSys,
                    bpDia: e.bpDia,
                    pulse: e.pulse,
                    weight: e.weight,
                    tempF: e.tempF,
                  }}
                />
                <Link
                  href={`/queue/intake/${e.patient.id}`}
                  className="t-cap mt-3 flex min-h-11 items-center justify-center gap-1.5 border-t border-hairline pt-3 font-semibold text-peri active:opacity-60"
                >
                  <FolderInput size={14} /> Add patient history
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {staff && (
        <p className="t-micro mt-6 px-2 text-center text-ink3">
          Staff view — patient records stay with the doctor.
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
