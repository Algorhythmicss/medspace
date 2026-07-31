"use client";

import { useState } from "react";
import { Pin, Check } from "lucide-react";
import { updateStickyNote } from "@/app/actions";

// Durable context the doctor wants whispered before every visit
// ("Prefers Hindi", "Daughter manages meds"). One tap to edit, enter to save.
export default function StickyNoteEditor({
  patientId,
  note,
}: {
  patientId: string;
  note: string | null;
}) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center gap-2.5 rounded-2xl bg-card px-4 py-3 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] active:opacity-70"
      >
        <Pin size={15} className="shrink-0 text-label2" />
        <span className={`flex-1 text-[15px] ${note ? "text-label" : "text-label2"}`}>
          {note ?? "Add a note (language, caregiver, context…)"}
        </span>
      </button>
    );
  }

  return (
    <form
      action={async (fd) => {
        await updateStickyNote(fd);
        setEditing(false);
      }}
      className="flex items-center gap-2 rounded-2xl bg-card p-2 shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input
        name="note"
        defaultValue={note ?? ""}
        autoFocus
        placeholder="e.g. Prefers Hindi. Son Ankit coordinates."
        className="min-w-0 flex-1 rounded-xl bg-fillinput px-3 py-2 text-[15px] outline-none"
      />
      <button
        type="submit"
        className="shrink-0 rounded-xl bg-accent p-2.5 text-white active:opacity-80"
      >
        <Check size={16} strokeWidth={2.5} />
      </button>
    </form>
  );
}
