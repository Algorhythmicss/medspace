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
          className="flex items-center justify-center gap-2 rounded-2xl bg-surface py-3 text-[17px] font-semibold shadow-[var(--lift)] active:opacity-70"
        >
          <Printer size={18} /> Print
        </button>
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-2xl bg-jade py-3 text-center text-[17px] font-semibold text-white active:opacity-80"
          >
            WhatsApp
          </a>
        ) : (
          <span className="rounded-2xl bg-sunk py-3 text-center text-[15px] text-ink2">
            No phone on file
          </span>
        )}
      </div>
      <Link
        href={`/patients/${patientId}`}
        className="block w-full rounded-2xl bg-peri py-3 text-center text-[17px] font-semibold text-white active:opacity-80"
      >
        Done
      </Link>
    </div>
  );
}
