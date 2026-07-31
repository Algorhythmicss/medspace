import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import ReportForm from "@/components/ReportForm";

export const dynamic = "force-dynamic";

export default async function NewReport({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) notFound();

  return (
    <div className="px-4 pt-3">
      <header className="mb-4 flex items-center gap-1">
        <Link
          href={`/patients/${patient.id}`}
          className="-ml-2 p-1.5 text-orange active:opacity-60"
        >
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">{patient.name}</h1>
          <p className="text-[13px] text-ink2">Add report</p>
        </div>
      </header>

      <ReportForm patientId={patient.id} />
    </div>
  );
}
