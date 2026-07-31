"use client";

import Link from "next/link";
import { Printer } from "lucide-react";

// Share/print controls. The WhatsApp button only opens WhatsApp with the text
// prefilled — the doctor reviews and presses send themselves.
export default function RxActions({
  patientPhone,
  rxText,
  patientId,
}: {
  patientPhone: string | null;
  rxText: string;
  patientId: string;
}) {
  const waHref = patientPhone
    ? `https://wa.me/91${patientPhone.replace(/\D/g, "").slice(-10)}?text=${encodeURIComponent(rxText)}`
    : null;

  return (
    <div className="mt-4 space-y-2.5 pb-10 print:hidden">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          onClick={() => window.print()}
          className="flex items-center justify-center gap-2 rounded-2xl bg-card py-3 text-[17px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:opacity-70"
        >
          <Printer size={18} /> Print
        </button>
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl bg-ios-green py-3 text-center text-[17px] font-semibold text-white active:opacity-80"
          >
            WhatsApp
          </a>
        ) : (
          <span className="rounded-2xl bg-fillinput py-3 text-center text-[15px] text-label2">
            No phone on file
          </span>
        )}
      </div>
      <Link
        href={`/patients/${patientId}`}
        className="block w-full rounded-2xl bg-accent py-3 text-center text-[17px] font-semibold text-white active:opacity-80"
      >
        Done
      </Link>
    </div>
  );
}
