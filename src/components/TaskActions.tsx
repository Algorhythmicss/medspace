"use client";

import { useState, useTransition } from "react";
import { Phone, Check, MessageCircle } from "lucide-react";
import { completeTask, recordPlanShare } from "@/app/actions";
import type { PlanReach } from "@/lib/reach";

// The WhatsApp button opens WhatsApp with the reminder prefilled — the doctor
// reviews and sends it themselves. Nothing is sent automatically.
//
// When a patient has been sent the link and never opened it, the call button
// leads instead: another unread message is not follow-up, it just looks like it.
export default function TaskActions({
  waHref,
  telHref,
  taskIds,
  patientId,
  reach,
}: {
  waHref: string | null;
  telHref: string | null;
  taskIds: string[];
  patientId: string;
  reach: PlanReach;
}) {
  const [pending, startTransition] = useTransition();
  const [justSent, setJustSent] = useState(false);
  const callFirst = reach.callFirst && !justSent && !!telHref;

  return (
    <div className="mt-3 flex gap-2">
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Send the reminder on WhatsApp"
          onClick={() => {
            setJustSent(true);
            void recordPlanShare(patientId);
          }}
          className={
            callFirst
              ? "flex items-center gap-1.5 rounded-xl bg-sunk px-3.5 py-2.5 text-[15px] font-medium active:opacity-70"
              : "flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-jade py-2.5 text-center text-[15px] font-semibold text-white active:opacity-80"
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
              ? "flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-jade py-2.5 text-[15px] font-semibold text-white active:opacity-80"
              : "flex items-center gap-1.5 rounded-xl bg-sunk px-3.5 py-2.5 text-[15px] font-medium active:opacity-70"
          }
        >
          <Phone size={15} /> Call
        </a>
      )}
      <button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            for (const id of taskIds) await completeTask(id);
          })
        }
        className="flex items-center gap-1.5 rounded-xl bg-sunk px-3.5 py-2.5 text-[15px] font-medium active:opacity-70 disabled:opacity-50"
      >
        <Check size={15} /> Done
      </button>
    </div>
  );
}
