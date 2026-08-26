"use client";

import { Phone, MessageCircle } from "lucide-react";
import { recordPlanShare } from "@/app/actions";
import type { PlanReach } from "@/lib/reach";

// One-tap recall for a drifted patient: the doctor's own WhatsApp with the
// message prefilled, or a call. No "Done" — there is no task to close; the
// patient leaves the list by actually coming back. Deliberately not a campaign
// tool — one patient, one press, the doctor sends it.
export default function RecallActions({
  waHref,
  telHref,
  patientId,
  reach,
}: {
  waHref: string | null;
  telHref: string | null;
  patientId: string;
  reach: PlanReach;
}) {
  const callFirst = reach.callFirst && !!telHref;

  return (
    <div className="mt-3 flex gap-2">
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Send a recall message on WhatsApp"
          onClick={() => void recordPlanShare(patientId)}
          className={
            callFirst
              ? "flex items-center gap-1.5 rounded-xl bg-sunk px-3.5 py-2.5 t-body font-medium active:opacity-70"
              : "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-jade py-2.5 text-center t-body font-semibold text-white active:opacity-80"
          }
        >
          <MessageCircle size={15} strokeWidth={2.2} />
          {!callFirst && "WhatsApp"}
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
          className={
            callFirst
              ? "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-jade py-2.5 t-body font-semibold text-white active:opacity-80"
              : "flex items-center gap-1.5 rounded-xl bg-sunk px-3.5 py-2.5 t-body font-medium active:opacity-70"
          }
        >
          <Phone size={15} /> Call
        </a>
      )}
    </div>
  );
}
