import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ArrowRight } from "lucide-react";
import { db } from "@/lib/db";
import { mergePatientRecords } from "@/app/actions";
import { relDay, patientAgeSex } from "@/lib/format";

export const dynamic = "force-dynamic";

async function summarise(id: string) {
  const [patient, visits, reports, tasks, lastVisit] = await Promise.all([
    db.patient.findUnique({ where: { id }, include: { conditions: { where: { status: "active" } } } }),
    db.visit.count({ where: { patientId: id } }),
    db.report.count({ where: { patientId: id } }),
    db.carePlanTask.count({ where: { patientId: id, status: "pending" } }),
    db.visit.findFirst({ where: { patientId: id }, orderBy: { visitDate: "desc" } }),
  ]);
  return patient ? { patient, visits, reports, tasks, lastVisit } : null;
}

export default async function MergePatients({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ with?: string }>;
}) {
  const { id } = await params;
  const { with: otherId } = await searchParams;
  if (!otherId || otherId === id) notFound();

  const [a, b] = await Promise.all([summarise(id), summarise(otherId)]);
  if (!a || !b) notFound();

  // Default keeper = the record with more history, so the smaller stub folds in.
  const [keeper, dup] = a.visits >= b.visits ? [a, b] : [b, a];

  const Card = ({ s, role }: { s: typeof a; role: string }) => (
    <div className="card p-4">
      <div className="flex items-baseline justify-between">
        <span className="text-[17px] font-semibold">{s.patient.name}</span>
        <span className="rounded-full bg-sunk px-2 py-0.5 text-[11.5px] font-medium text-ink2">{role}</span>
      </div>
      <p className="text-[13px] text-ink2">
        #{s.patient.fileNumber}
        {s.patient.phone ? ` · ${s.patient.phone}` : ""}
        {patientAgeSex(s.patient) ? ` · ${patientAgeSex(s.patient)}` : ""}
      </p>
      <p className="mt-1.5 text-[13px]">
        {s.visits} visit{s.visits === 1 ? "" : "s"} · {s.reports} report{s.reports === 1 ? "" : "s"} ·{" "}
        {s.tasks} pending
      </p>
      {s.lastVisit && (
        <p className="text-[13px] text-ink2">Last seen {relDay(s.lastVisit.visitDate)}</p>
      )}
      {s.patient.conditions.length > 0 && (
        <p className="mt-1 text-[13px] text-ink2">
          {s.patient.conditions.map((c) => c.name).join(", ")}
        </p>
      )}
    </div>
  );

  return (
    <div className="px-4 pt-3">
      <header className="mb-4 flex items-center gap-1">
        <Link href={`/patients/${id}`} className="-ml-2 p-1.5 text-orange active:opacity-60">
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">Merge records</h1>
          <p className="text-[13px] text-ink2">Same person, two files</p>
        </div>
      </header>

      <div className="space-y-2.5">
        <Card s={keeper} role="Keep" />
        <div className="flex items-center justify-center gap-2 text-[13px] text-ink2">
          <ArrowRight size={16} className="rotate-90" />
          folds into the record above
        </div>
        <Card s={dup} role="Merge in" />
      </div>

      <div className="mt-4 rounded-2xl bg-sunnysoft p-4">
        <p className="text-[13px] font-semibold text-sunny">This cannot be undone</p>
        <p className="mt-1 text-[13px] text-ink2">
          All {dup.visits} visit{dup.visits === 1 ? "" : "s"}, {dup.reports} report
          {dup.reports === 1 ? "" : "s"} and pending tasks from #{dup.patient.fileNumber} move to #
          {keeper.patient.fileNumber}. Nothing clinical is deleted — only the duplicate file entry
          for {dup.patient.name} disappears.
        </p>
      </div>

      <form action={mergePatientRecords} className="mt-4 space-y-2.5 pb-10">
        <input type="hidden" name="keeperId" value={keeper.patient.id} />
        <input type="hidden" name="duplicateId" value={dup.patient.id} />
        <button
          type="submit"
          className="w-full rounded-2xl bg-coral py-3.5 text-[17px] font-semibold text-white active:opacity-80"
        >
          Merge into #{keeper.patient.fileNumber}
        </button>
        <Link
          href={`/patients/${id}`}
          className="block w-full rounded-2xl bg-sunk py-3.5 text-center text-[17px] font-medium active:opacity-70"
        >
          Cancel
        </Link>
      </form>
    </div>
  );
}
