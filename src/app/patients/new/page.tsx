import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import NewPatientForm from "@/components/NewPatientForm";

export default function NewPatient() {
  return (
    <div className="px-4 pt-3">
      <header className="mb-4 flex items-center gap-1">
        <Link href="/" className="-ml-2 p-1.5 text-accent active:opacity-60">
          <ChevronLeft size={26} />
        </Link>
        <h1 className="text-[22px] font-bold tracking-tight">New patient</h1>
      </header>

      <NewPatientForm />

      <p className="mt-4 text-center text-[13px] text-label2">
        Name alone is enough to start — details can come later.
      </p>
    </div>
  );
}
