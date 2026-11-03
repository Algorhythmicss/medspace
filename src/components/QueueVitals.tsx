"use client";

import { useState, useTransition } from "react";
import { Activity, CheckCircle2 } from "lucide-react";
import { setQueueVitals } from "@/app/actions";

type V = {
  bpSys: number | null;
  bpDia: number | null;
  pulse: number | null;
  weight: number | null;
  tempF: number | null;
};

const FIELDS = [
  ["bpSys", "Sys"],
  ["bpDia", "Dia"],
  ["pulse", "Pulse"],
  ["weight", "Wt"],
  ["tempF", "°F"],
] as const;

// Staff (usually a nurse) records a waiting patient's vitals while they wait for
// the doctor — the way it happens in a real clinic. Saved vitals show inline and
// flow straight to the doctor's chart and the visit form.
export default function QueueVitals({
  entryId,
  vitals,
  revision,
}: {
  entryId: string;
  vitals: V;
  revision?: number;
}) {
  const has =
    vitals.bpSys != null ||
    vitals.bpDia != null ||
    vitals.pulse != null ||
    vitals.weight != null ||
    vitals.tempF != null;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({
    bpSys: vitals.bpSys?.toString() ?? "",
    bpDia: vitals.bpDia?.toString() ?? "",
    pulse: vitals.pulse?.toString() ?? "",
    weight: vitals.weight?.toString() ?? "",
    tempF: vitals.tempF?.toString() ?? "",
  });
  const [pending, start] = useTransition();
  const [baseRevision, setBaseRevision] = useState(revision);
  const [error, setError] = useState("");

  const summary = [
    vitals.bpSys ? `BP ${vitals.bpSys}/${vitals.bpDia ?? "?"}` : null,
    vitals.pulse ? `${vitals.pulse} bpm` : null,
    vitals.weight ? `${vitals.weight} kg` : null,
    vitals.tempF ? `${vitals.tempF}°F` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  function save() {
    const num = (s: string) => (s.trim() ? Number(s) : null);
    start(async () => {
      setError("");
      try {
        const result = await setQueueVitals(
          entryId,
          {
            bpSys: num(form.bpSys),
            bpDia: num(form.bpDia),
            pulse: num(form.pulse),
            weight: num(form.weight),
            tempF: num(form.tempF),
          },
          baseRevision,
        );
        if (result && !result.ok) {
          setError(result.error);
          return;
        }
        setOpen(false);
      } catch {
        setError(
          "Could not confirm the measurements. Check the connection and try again.",
        );
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => {
          setBaseRevision(revision);
          setForm(
            Object.fromEntries(
              Object.entries(vitals).map(([key, value]) => [
                key,
                value?.toString() ?? "",
              ]),
            ),
          );
          setError("");
          setOpen(true);
        }}
        aria-expanded={open}
        className={`t-cap mt-2 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-semibold active:opacity-70 ${
          has ? "bg-jadesoft text-jade" : "bg-buttersoft text-butter"
        }`}
      >
        {has ? (
          <CheckCircle2 size={13} strokeWidth={2.4} />
        ) : (
          <Activity size={13} strokeWidth={2.4} />
        )}
        {has ? `Ready · ${summary}` : "Vitals pending — record"}
      </button>
    );
  }

  return (
    <div className="mt-2.5">
      {error ? (
        <p role="alert" className="t-cap mb-2 text-coral">
          {error}
        </p>
      ) : null}
      <div className="grid grid-cols-5 gap-1.5">
        {FIELDS.map(([key, ph]) => (
          <input
            key={key}
            aria-label={ph}
            value={form[key]}
            onChange={(e) => setForm((s) => ({ ...s, [key]: e.target.value }))}
            placeholder={ph}
            inputMode="decimal"
            className="ring-focus w-full rounded-xl bg-sunk px-1.5 py-2 text-center text-[15px] outline-none placeholder:text-ink3"
          />
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <button
          disabled={pending}
          onClick={() => setOpen(false)}
          className="flex-1 rounded-xl bg-sunk py-2 text-[13px] font-semibold text-ink2 active:opacity-70"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={pending}
          className="flex-1 rounded-xl bg-peri py-2 text-[13px] font-semibold text-white active:opacity-80 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save vitals"}
        </button>
      </div>
    </div>
  );
}
