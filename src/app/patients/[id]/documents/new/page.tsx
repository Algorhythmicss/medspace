import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import MedicalDocumentForm from "@/components/MedicalDocumentForm";

export const dynamic = "force-dynamic";

function indiaDateInput(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export default async function NewMedicalDocument({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [patient, clinic] = await Promise.all([
    db.patient.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        fileNumber: true,
        visits: {
          orderBy: { visitDate: "desc" },
          take: 8,
          select: { id: true, visitDate: true, complaint: true, diagnosis: true },
        },
      },
    }),
    db.clinic.findUnique({ where: { id: "clinic" } }),
  ]);
  if (!patient) notFound();

  return (
    <div className="mx-auto w-full max-w-[680px] pt-3">
      <header className="mb-5 flex items-center gap-2">
        <Link
          href={`/patients/${patient.id}`}
          aria-label="Back to chart"
          className="-ml-2 rounded-full p-2 text-ink3 active:opacity-60"
        >
          <ChevronLeft size={24} />
        </Link>
        <div>
          <p className="t-micro font-semibold text-peri">#{patient.fileNumber} · {patient.name}</p>
          <h1 className="t-title">Issue a document</h1>
          <p className="t-cap mt-0.5 text-ink3">Clinic letterhead, ready to print or share.</p>
        </div>
      </header>

      <MedicalDocumentForm
        patientId={patient.id}
        patientName={patient.name}
        clinicName={clinic?.clinicName ?? "the clinic"}
        today={indiaDateInput()}
        visits={patient.visits.map((visit) => ({
          ...visit,
          visitDate: visit.visitDate.toISOString(),
        }))}
      />
    </div>
  );
}
