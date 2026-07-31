import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import NewPatientForm from "@/components/NewPatientForm";
import { ArtBand } from "@/components/Art";

export default function NewPatient() {
  return (
    <div className="mx-auto w-full max-w-[520px] pt-3">
      <header className="mb-4 flex items-center gap-1">
        <Link href="/" className="-ml-2 p-1.5 text-peri active:opacity-60">
          <ChevronLeft size={26} />
        </Link>
        <h1 className="text-[22px] font-bold tracking-tight">New patient</h1>
      </header>

      <div className="mb-5 overflow-hidden rounded-[22px] shadow-[var(--lift)]">
        <ArtBand name="reception" height="h-[120px]" small />
      </div>

      <NewPatientForm />

      <p className="mt-4 text-center text-[13px] text-ink2">
        Name alone is enough to start — details can come later.
      </p>
    </div>
  );
}
