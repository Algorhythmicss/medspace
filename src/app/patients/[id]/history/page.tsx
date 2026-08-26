import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import BaselineHistoryForm from "@/components/BaselineHistoryForm";

export const dynamic = "force-dynamic";

export default async function AddPatientHistory({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      conditions: { where: { status: "active" }, orderBy: { createdAt: "asc" } },
      allergies: true,
    },
  });
  if (!patient) notFound();

  return (
    <div className="mx-auto w-full max-w-[560px] pt-3">
      <header className="mb-5 flex items-center gap-1">
        <Link href={`/patients/${id}`} aria-label="Back" className="-ml-2 p-1.5 text-peri active:opacity-60">
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="t-title">Add previous history</h1>
          <p className="t-cap text-ink3">{patient.name} · #{patient.fileNumber}</p>
        </div>
      </header>
      <BaselineHistoryForm
        patientId={patient.id}
        existing={{
          conditions: patient.conditions.map((condition) => condition.name),
          allergies: patient.allergies.map((allergy) => allergy.substance),
          medications: patient.reportedMedications,
        }}
      />
    </div>
  );
}

