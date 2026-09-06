"use client";

import Link from "next/link";
import { Printer, RefreshCw } from "lucide-react";
import { waLink } from "@/lib/phone";

export default function DocumentActions({
  patientPhone,
  documentText,
  patientId,
}: {
  patientPhone: string | null;
  documentText: string;
  patientId: string;
}) {
  const waHref = waLink(patientPhone, documentText);
  return (
    <div className="mt-4 space-y-2.5 pb-10 print:hidden">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={() => window.print()}
          className="btn flex items-center justify-center gap-2 bg-surface py-3 shadow-[var(--lift)]"
        >
          <Printer size={18} /> Print
        </button>
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="btn flex items-center justify-center bg-jade py-3 text-white"
          >
            WhatsApp
          </a>
        ) : (
          <span className="t-cap rounded-2xl bg-sunk py-3 text-center text-ink2">
            No phone on file
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Link
          href={`/patients/${patientId}/documents/new`}
          className="btn flex items-center justify-center gap-2 bg-surface py-3 shadow-[var(--lift)]"
        >
          <RefreshCw size={16} /> Reissue
        </Link>
        <Link href={`/patients/${patientId}`} className="btn btn-primary py-3 text-center">
          Done
        </Link>
      </div>
      <p className="t-micro px-1 text-center text-ink3">
        WhatsApp opens with the document text ready. Review it, then press send.
      </p>
    </div>
  );
}
