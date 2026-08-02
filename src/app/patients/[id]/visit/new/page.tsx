import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { buildMemoryCard } from "@/lib/memory";
import Briefing from "@/components/Briefing";
import VisitForm from "@/components/VisitForm";

export const dynamic = "force-dynamic";

export default async function NewVisit({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [patient, card, checkin] = await Promise.all([
    db.patient.findUnique({
      where: { id },
      include: {
        visits: {
          orderBy: { visitDate: "desc" },
          take: 1,
          include: { prescription: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
        },
      },
    }),
    buildMemoryCard(id),
    // Vitals the front desk took at check-in — so the doctor never re-types them.
    db.queueEntry.findFirst({
      where: {
        patientId: id,
        arrivedAt: { gte: todayStart },
        OR: [
          { bpSys: { not: null } },
          { pulse: { not: null } },
          { weight: { not: null } },
          { tempF: { not: null } },
        ],
      },
      orderBy: { arrivedAt: "desc" },
      select: { bpSys: true, bpDia: true, pulse: true, weight: true, tempF: true },
    }),
  ]);
  if (!patient || !card) notFound();

  const lastRxItems =
    patient.visits[0]?.prescription?.items.map((i) => ({
      drugName: i.drugName,
      frequency: i.frequency,
      duration: i.duration ?? undefined,
      instructions: i.instructions ?? undefined,
    })) ?? [];

  const checkinVitals = {
    bpSys: checkin?.bpSys != null ? String(checkin.bpSys) : "",
    bpDia: checkin?.bpDia != null ? String(checkin.bpDia) : "",
    pulse: checkin?.pulse != null ? String(checkin.pulse) : "",
    weight: checkin?.weight != null ? String(checkin.weight) : "",
    tempF: checkin?.tempF != null ? String(checkin.tempF) : "",
  };

  return (
    <div className="mx-auto w-full max-w-[720px] pt-3">
      <header className="mb-3 flex items-center justify-between">
        <Link
          href={`/patients/${patient.id}`}
          aria-label="Back to chart"
          className="-ml-2 rounded-full p-2 text-ink3 transition-opacity active:opacity-60"
        >
          <ChevronLeft size={24} />
        </Link>
        <span className="rounded-full bg-sunk px-3 py-1.5 text-[13px] font-semibold text-ink2">
          New visit
        </span>
      </header>

      <div className="mb-5">
        <Briefing
          card={card}
          patientId={patient.id}
          note={patient.stickyNote}
          name={patient.name}
          fileNumber={patient.fileNumber}
        />
      </div>

      <VisitForm patientId={patient.id} lastRxItems={lastRxItems} checkinVitals={checkinVitals} />
    </div>
  );
}
