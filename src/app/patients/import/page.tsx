import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import RosterImportForm from "@/components/RosterImportForm";

export default function ImportPatients() {
  return (
    <div className="mx-auto w-full max-w-[560px] pt-3">
      <header className="mb-5 flex items-center gap-1">
        <Link href="/patients/new" aria-label="Back" className="-ml-2 p-1.5 text-peri active:opacity-60">
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="t-title">Import patient list</h1>
          <p className="t-cap text-ink3">Start with upcoming and repeat-care patients</p>
        </div>
      </header>

      <RosterImportForm />

      <section className="mt-4 rounded-2xl bg-perisoft p-4">
        <h2 className="t-head text-peri">Accepted columns</h2>
        <p className="t-cap mt-1 text-ink2">Name is required. Phone, age, sex and file number are optional.</p>
        <code className="t-micro mt-3 block overflow-x-auto rounded-xl bg-surface px-3 py-2 text-ink2">
          Name,Phone,Age,Sex,File Number
        </code>
        <a
          href="/patient-import-template.csv"
          download
          className="t-cap mt-3 inline-flex font-semibold text-peri underline decoration-peri/30 underline-offset-4"
        >
          Download CSV template
        </a>
        <p className="t-micro mt-3 text-ink3">Import only the patients expected in the next few weeks first. Their older clinical history can be added progressively.</p>
      </section>
    </div>
  );
}
