"use client";

import { useTransition } from "react";
import { Phone, Check, MessageCircle } from "lucide-react";
import { completeTask } from "@/app/actions";

// The WhatsApp button opens WhatsApp with the reminder prefilled — the doctor
// reviews and sends it themselves. Nothing is sent automatically.
export default function TaskActions({
  waHref,
  phone,
  taskIds,
}: {
  waHref: string | null;
  phone: string | null;
  taskIds: string[];
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-3 flex gap-2">
      {waHref ? (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl bg-ios-green py-2.5 text-center text-[15px] font-semibold text-white active:opacity-80"
        >
          <MessageCircle size={15} strokeWidth={2.2} /> WhatsApp
        </a>
      ) : (
        <span className="flex-1 rounded-xl bg-fillinput py-2.5 text-center text-[13px] text-label2">
          No phone on file
        </span>
      )}
      {phone && (
        <a
          href={`tel:${phone}`}
          className="flex items-center gap-1.5 rounded-xl bg-fillinput px-3.5 py-2.5 text-[15px] font-medium active:opacity-70"
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
        className="flex items-center gap-1.5 rounded-xl bg-fillinput px-3.5 py-2.5 text-[15px] font-medium active:opacity-70 disabled:opacity-50"
      >
        <Check size={15} /> Done
      </button>
    </div>
  );
}
