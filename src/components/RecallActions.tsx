"use client";

import { Phone, MessageCircle } from "lucide-react";
import { recordPlanShare } from "@/app/actions";

// One-tap recall for a drifted patient: the doctor's own WhatsApp with the
// message prefilled, or a call. No "Done" — there is no task to close; the
// patient leaves the list by actually coming back. Deliberately not a campaign
// tool — one patient, one press, the doctor sends it.
export default function RecallActions({
  waHref,
  telHref,
  patientId,
}: {
  waHref: string | null;
  telHref: string | null;
  patientId: string;
}) {
  return (
    <div className="mt-3 flex gap-2">
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Send a recall message on WhatsApp"
          onClick={() => void recordPlanShare(patientId)}
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-jade py-2.5 text-center text-[15px] font-semibold text-white active:opacity-80"
        >
          <MessageCircle size={15} strokeWidth={2.2} /> WhatsApp
        </a>
      ) : (
        !telHref && (
          <span className="flex-1 rounded-xl bg-sunk py-2.5 text-center text-[13px] text-ink2">
            No usable phone number
          </span>
        )
      )}
      {telHref && (
        <a
          href={telHref}
          className="flex items-center gap-1.5 rounded-xl bg-sunk px-3.5 py-2.5 text-[15px] font-medium active:opacity-70"
        >
          <Phone size={15} /> Call
        </a>
      )}
    </div>
  );
}
