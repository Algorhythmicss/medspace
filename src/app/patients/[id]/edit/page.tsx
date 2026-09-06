import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { storablePhone } from "@/lib/phone";
import PatientDetailsForm from "@/components/PatientDetailsForm";

export const dynamic = "force-dynamic";

export default async function EditPatient({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) notFound();

  // Another record on the same phone almost always means one person split
  // across two memories — surface it rather than silently allowing the drift.
  // Compare on the canonical form: numbers are normalised on write, so matching
  // that rather than the raw string also catches a legacy row stored as typed.
  const twinPhone = storablePhone(patient.phone);
  const phoneTwin = twinPhone
    ? await db.patient.findFirst({
        where: { phone: twinPhone, id: { not: patient.id } },
        select: { id: true, name: true, fileNumber: true },
      })
    : null;

  return (
    <div className="mx-auto w-full max-w-[520px] pt-3">
      <header className="mb-4 flex items-center gap-1">
        <Link
          href={`/patients/${patient.id}`}
          className="-ml-2 p-1.5 text-peri active:opacity-60"
        >
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="text-[22px] font-bold leading-tight tracking-tight">Edit details</h1>
          <p className="text-[13px] text-ink2">#{patient.fileNumber}</p>
        </div>
      </header>

      {phoneTwin && (
        <div className="mb-3 rounded-2xl bg-buttersoft px-4 py-3">
          <p className="text-[13px] font-semibold text-butter">Same phone as another record</p>
          <p className="text-[13px] text-ink2">
            {phoneTwin.name} · #{phoneTwin.fileNumber}
          </p>
          <div className="mt-2 flex gap-2">
            <Link
              href={`/patients/${phoneTwin.id}`}
              className="flex-1 rounded-xl bg-surface py-2 text-center text-[13px] font-semibold active:opacity-70"
            >
              Open it
            </Link>
            <Link
              href={`/patients/${patient.id}/merge?with=${phoneTwin.id}`}
              className="flex-1 rounded-xl bg-butter py-2 text-center text-[13px] font-semibold text-white active:opacity-80"
            >
              Same person — merge
            </Link>
          </div>
        </div>
      )}

      <PatientDetailsForm
        patientId={patient.id}
        initial={{
          name: patient.name,
          phone: patient.phone ?? "",
          age: patient.ageYears != null ? String(patient.ageYears) : "",
          sex: patient.sex ?? "",
          address: patient.address ?? "",
          abhaId: patient.abhaId ?? "",
          language: patient.language === "hi" ? "hi" : "en",
        }}
      />
    </div>
  );
}
