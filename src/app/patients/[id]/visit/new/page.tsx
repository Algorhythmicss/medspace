import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { buildMemoryCard } from "@/lib/memory";
import MemoryCardView from "@/components/MemoryCardView";
import StickyNoteEditor from "@/components/StickyNoteEditor";
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
      <header className="mb-3 flex items-center gap-1">
        <Link
          href={`/patients/${patient.id}`}
          className="-ml-2 p-1.5 text-accent active:opacity-60"
        >
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">{patient.name}</h1>
          <p className="text-[13px] text-label2">New visit</p>
        </div>
      </header>

      <div className="mb-2">
        <MemoryCardView card={card} />
      </div>
      <div className="mb-5">
        <StickyNoteEditor patientId={patient.id} note={patient.stickyNote} />
      </div>

      <VisitForm patientId={patient.id} lastRxItems={lastRxItems} />
    </div>
  );
}
