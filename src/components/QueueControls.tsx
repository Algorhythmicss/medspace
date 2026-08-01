"use client";

import { useTransition } from "react";
import { X, Check } from "lucide-react";
import { removeFromQueue, markQueueSeen } from "@/app/actions";

// Front-desk: take someone off the queue (left / added by mistake).
export function RemoveFromQueue({ entryId }: { entryId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => removeFromQueue(entryId))}
      aria-label="Remove from queue"
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sunk text-ink3 active:opacity-60 disabled:opacity-50"
    >
      <X size={16} strokeWidth={2.4} />
    </button>
  );
}

// Doctor: mark seen without opening a full visit (clears them off "In clinic").
export function MarkSeen({ entryId }: { entryId: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(() => markQueueSeen(entryId))}
      className="flex shrink-0 items-center gap-1.5 rounded-xl bg-sunk px-3 py-2 text-[14px] font-medium active:opacity-70 disabled:opacity-50"
    >
      <Check size={15} strokeWidth={2.4} /> Seen
    </button>
  );
}
