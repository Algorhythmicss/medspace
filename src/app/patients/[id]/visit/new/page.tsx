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
  const [patient, card] = await Promise.all([
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
  ]);
  if (!patient || !card) notFound();

  const lastRxItems =
    patient.visits[0]?.prescription?.items.map((i) => ({
      drugName: i.drugName,
      frequency: i.frequency,
      duration: i.duration ?? undefined,
      instructions: i.instructions ?? undefined,
    })) ?? [];

  return (
    <div className="px-4 pt-3">
      <header className="mb-4 flex items-center gap-1.5">
        <Link
          href={`/patients/${patient.id}`}
          aria-label="Back to chart"
          className="-ml-2 rounded-full p-1.5 text-ink3 transition-colors active:bg-sunk"
        >
          <ChevronLeft size={24} />
        </Link>
        <div className="min-w-0">
          <h1 className="truncate font-display text-[24px] font-bold leading-tight tracking-[-0.02em]">
            {patient.name}
          </h1>
          <p className="text-[12.5px] text-ink3">New visit</p>
        </div>
      </header>

      <div className="mb-5">
        <Briefing card={card} patientId={patient.id} note={patient.stickyNote} />
      </div>

      <VisitForm patientId={patient.id} lastRxItems={lastRxItems} />
    </div>
  );
}
