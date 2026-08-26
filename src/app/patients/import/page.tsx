import Link from "next/link";
import { ChevronDown, ChevronLeft } from "lucide-react";
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

      <details className="group card mt-3 overflow-hidden">
        <summary className="pressable flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span>
            <span className="t-cap block font-semibold text-ink2">CSV format and template</span>
            <span className="t-micro block text-ink3">Name is the only required column</span>
          </span>
          <ChevronDown size={17} className="shrink-0 text-ink3 transition-transform group-open:rotate-180" />
        </summary>
        <div className="border-t border-hairline px-4 py-3.5">
          <p className="t-cap text-ink2">Phone, age, sex and file number are optional.</p>
          <code className="t-micro mt-2 block overflow-x-auto rounded-xl bg-sunk px-3 py-2 text-ink2">
            Name,Phone,Age,Sex,File Number
          </code>
          <a
            href="/patient-import-template.csv"
            download
            className="t-cap mt-3 inline-flex font-semibold text-peri active:opacity-60"
          >
            Download CSV template
          </a>
          <p className="t-micro mt-3 text-ink3">Start with patients expected in the next few weeks. Add older history only when it becomes useful.</p>
        </div>
      </details>
    </div>
  );
}
