"use client";

import { useState } from "react";
import { Pin, Check } from "lucide-react";
import { updateStickyNote } from "@/app/actions";

// Durable human context the doctor wants whispered before every visit
// ("Prefers Hindi", "Daughter manages meds"). Lives at the foot of the
// briefing card; tap to edit in place, Notion-style.
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
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left transition-opacity active:opacity-60"
      >
        <Pin size={13} className="shrink-0 text-ink3" />
        <span className={`flex-1 text-[13px] ${note ? "text-ink2" : "text-ink3"}`}>
          {note ?? "Add a note — language, caregiver, anything worth remembering"}
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
      className="flex items-center gap-2 px-3 py-3"
    >
      <input type="hidden" name="patientId" value={patientId} />
      <input
        name="note"
        defaultValue={note ?? ""}
        autoFocus
        placeholder="e.g. Prefers Hindi. Son Ankit coordinates."
        className="field min-w-0 flex-1 !py-2 !text-[14px]"
      />
      <button
        type="submit"
        aria-label="Save note"
        className="btn btn-primary shrink-0 p-2.5"
      >
        <Check size={15} strokeWidth={2.6} />
      </button>
    </form>
  );
}
