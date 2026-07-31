"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { RotateCw, X, FlaskConical, AlertTriangle } from "lucide-react";
import { createVisit, type RxItemInput } from "@/app/actions";

const FREQ_CHIPS = ["1-0-1", "1-0-0", "0-0-1", "1-1-1", "0-1-0", "SOS"];
const DUR_CHIPS = ["5 days", "15 days", "30 days", "45 days", "90 days"];
const FOLLOWUP_CHIPS: Array<{ label: string; days: number | null }> = [
  { label: "None", days: null },
  { label: "1 wk", days: 7 },
  { label: "2 wk", days: 14 },
  { label: "1 mo", days: 30 },
  { label: "6 wk", days: 45 },
  { label: "3 mo", days: 90 },
];
const LAB_CHIPS = ["HbA1c", "FBS + PPBS", "Lipid profile", "KFT", "LFT", "TSH", "CBC", "ECG", "Urine ACR"];

type DrugSuggestion = {
  name: string;
  defaultFrequency: string | null;
  defaultDuration: string | null;
  defaultInstructions: string | null;
};

type Draft = {
  complaint: string;
  diagnosis: string;
  bpSys: string;
  bpDia: string;
  pulse: string;
  weight: string;
  items: RxItemInput[];
  advice: string;
  followUpInDays: number | null;
  labTasks: string[];
};

const EMPTY: Draft = {
  complaint: "",
  diagnosis: "",
  bpSys: "",
  bpDia: "",
  pulse: "",
  weight: "",
  items: [],
  advice: "",
  followUpInDays: null,
  labTasks: [],
};

function isEmpty(d: Draft) {
  return (
    !d.complaint.trim() &&
    !d.diagnosis.trim() &&
    !d.bpSys &&
    !d.bpDia &&
    !d.pulse &&
    !d.weight &&
    d.items.length === 0 &&
    !d.advice.trim() &&
    d.followUpInDays === null &&
    d.labTasks.length === 0
  );
}

const fieldCls =
  "w-full rounded-xl bg-sunk px-3.5 py-2.5 text-[17px] outline-none placeholder:text-ink2";

function Chip({
  on,
  onClick,
  children,
  tone = "accent",
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "accent" | "dark";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors active:opacity-70 ${
        on
          ? tone === "accent"
            ? "bg-primary text-white"
            : "bg-ink2 text-white"
          : "bg-sunk text-ink"
      }`}
    >
      {children}
    </button>
  );
}

export default function VisitForm({
  patientId,
  lastRxItems,
}: {
  patientId: string;
  lastRxItems: RxItemInput[];
}) {
  const draftKey = `medspace:visit-draft:${patientId}`;

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [restored, setRestored] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [drugQuery, setDrugQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([]);
  const [pending, startTransition] = useTransition();
  const hydrated = useRef(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Recover anything typed before a reload, crash, or failed save.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Draft;
        if (!isEmpty(parsed)) {
          setDraft({ ...EMPTY, ...parsed });
          setRestored(true);
        }
      }
    } catch {
      // corrupt draft — ignore rather than block the consult
    }
    hydrated.current = true;
  }, [draftKey]);

  // Autosave. Cheap enough to run on every change; keeps the window between
  // keystroke and durable copy under a second.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      try {
        if (isEmpty(draft)) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        // storage full or blocked — nothing useful to do mid-consult
      }
    }, 300);
    return () => clearTimeout(t);
  }, [draft, draftKey]);

  async function onDrugQuery(q: string) {
    setDrugQuery(q);
    if (!q.trim()) {
      setSuggestions([]);
      return;
    }
    try {
      const res = await fetch(`/api/drugs?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(data.drugs);
    } catch {
      setSuggestions([]);
    }
  }

  function addDrug(d: DrugSuggestion | string) {
    const isCustom = typeof d === "string";
    set("items", [
      ...draft.items,
      isCustom
        ? { drugName: d, frequency: "1-0-1", duration: "30 days" }
        : {
            drugName: d.name,
            frequency: d.defaultFrequency ?? "1-0-1",
            duration: d.defaultDuration ?? "30 days",
            instructions: d.defaultInstructions ?? undefined,
          },
    ]);
    setDrugQuery("");
    setSuggestions([]);
  }

  function updateItem(i: number, patch: Partial<RxItemInput>) {
    set(
      "items",
      draft.items.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
    );
  }

  function discardDraft() {
    setDraft(EMPTY);
    setRestored(false);
    setSaveError(false);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  function submit() {
    setSaveError(false);
    startTransition(async () => {
      // Drop the local copy optimistically; a successful save redirects away
      // and the draft must not linger. Restored below if the save fails.
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      try {
        await createVisit({
          patientId,
          complaint: draft.complaint.trim() || undefined,
          diagnosis: draft.diagnosis.trim() || undefined,
          vitals: {
            bpSys: draft.bpSys ? Number(draft.bpSys) : undefined,
            bpDia: draft.bpDia ? Number(draft.bpDia) : undefined,
            pulse: draft.pulse ? Number(draft.pulse) : undefined,
            weight: draft.weight ? Number(draft.weight) : undefined,
          },
          items: draft.items,
          advice: draft.advice.trim() || undefined,
          followUpInDays: draft.followUpInDays ?? undefined,
          labTasks: draft.labTasks,
        });
      } catch (err) {
        // A successful action redirects, which surfaces here as a control-flow
        // signal — not a failure. Anything else means the save didn't land.
        const digest = (err as { digest?: string })?.digest ?? "";
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        try {
          localStorage.setItem(draftKey, JSON.stringify(draft));
        } catch {
          /* ignore */
        }
        setSaveError(true);
      }
    });
  }

  return (
    <div className="space-y-6 pb-10">
      {restored && (
        <div className="flex items-center gap-2 rounded-2xl bg-primarysoft px-4 py-3">
          <p className="flex-1 text-[13px] text-primary">
            Restored what you had typed for this patient.
          </p>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 text-[13px] font-semibold text-primary active:opacity-60"
          >
            Start fresh
          </button>
        </div>
      )}

      {/* one-tap repeat — the ≤30s path for chronic refills */}
      {lastRxItems.length > 0 && draft.items.length === 0 && (
        <button
          type="button"
          onClick={() => set("items", lastRxItems)}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primarysoft px-4 py-3.5 text-[17px] font-semibold text-primary active:bg-primarysoft"
        >
          <RotateCw size={18} strokeWidth={2.2} />
          Repeat last prescription ({lastRxItems.length} meds)
        </button>
      )}

      <div className="space-y-2.5">
        <input
          value={draft.complaint}
          onChange={(e) => set("complaint", e.target.value)}
          placeholder="Complaint"
          className={fieldCls}
        />
        <input
          value={draft.diagnosis}
          onChange={(e) => set("diagnosis", e.target.value)}
          placeholder="Diagnosis"
          className={fieldCls}
        />
      </div>

      <div>
        <h3 className="label mb-2 px-1">
          Vitals
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ["Sys", "bpSys", "numeric"],
              ["Dia", "bpDia", "numeric"],
              ["Pulse", "pulse", "numeric"],
              ["Wt kg", "weight", "decimal"],
            ] as const
          ).map(([ph, key, mode]) => (
            <input
              key={ph}
              value={draft[key]}
              onChange={(e) => set(key, e.target.value)}
              placeholder={ph}
              inputMode={mode}
              className="rounded-xl bg-sunk px-2 py-2.5 text-center text-[17px] outline-none placeholder:text-ink2"
            />
          ))}
        </div>
      </div>

      <div>
        <h3 className="label mb-2 px-1">
          Prescription
        </h3>
        {draft.items.length > 0 && (
          <ul className="mb-2.5 space-y-2.5">
            {draft.items.map((item, i) => (
              <li
                key={i}
                className="card p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-[17px] font-medium leading-snug">{item.drugName}</span>
                  <button
                    type="button"
                    onClick={() =>
                      set(
                        "items",
                        draft.items.filter((_, idx) => idx !== i)
                      )
                    }
                    className="mt-0.5 shrink-0 rounded-full bg-sunk p-1 text-ink2 active:opacity-60"
                  >
                    <X size={13} strokeWidth={2.5} />
                  </button>
                </div>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {FREQ_CHIPS.map((f) => (
                    <Chip key={f} on={item.frequency === f} onClick={() => updateItem(i, { frequency: f })}>
                      {f}
                    </Chip>
                  ))}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {DUR_CHIPS.map((dur) => (
                    <Chip
                      key={dur}
                      tone="dark"
                      on={item.duration === dur}
                      onClick={() => updateItem(i, { duration: dur })}
                    >
                      {dur.replace(" days", "d")}
                    </Chip>
                  ))}
                </div>
                {item.instructions && (
                  <p className="mt-2 text-[13px] text-ink2">{item.instructions}</p>
                )}
              </li>
            ))}
          </ul>
        )}
        <div className="relative">
          <input
            value={drugQuery}
            onChange={(e) => onDrugQuery(e.target.value)}
            placeholder="Add medicine…"
            className={fieldCls}
          />
          {suggestions.length > 0 && (
            <div className="rows absolute inset-x-0 top-full z-10 mt-1.5 overflow-hidden rounded-2xl bg-surface shadow-[var(--lift-lg)]">
              {suggestions.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  onClick={() => addDrug(d)}
                  className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[15px] active:bg-black/5"
                >
                  <span>{d.name}</span>
                  <span className="text-[12px] text-ink2">{d.defaultFrequency}</span>
                </button>
              ))}
              {drugQuery.trim() && (
                <button
                  type="button"
                  onClick={() => addDrug(drugQuery.trim())}
                  className="w-full px-4 py-2.5 text-left text-[15px] font-medium text-primary active:bg-black/5"
                >
                  + Add “{drugQuery.trim()}”
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <input
        value={draft.advice}
        onChange={(e) => set("advice", e.target.value)}
        placeholder="Advice (diet, activity…)"
        className={fieldCls}
      />

      <div>
        <h3 className="label mb-2 px-1">
          Follow-up
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {FOLLOWUP_CHIPS.map((c) => (
            <Chip
              key={c.label}
              on={draft.followUpInDays === c.days}
              onClick={() => set("followUpInDays", c.days)}
            >
              {c.label}
            </Chip>
          ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {LAB_CHIPS.map((lab) => {
            const on = draft.labTasks.includes(lab);
            return (
              <button
                key={lab}
                type="button"
                onClick={() =>
                  set(
                    "labTasks",
                    on ? draft.labTasks.filter((l) => l !== lab) : [...draft.labTasks, lab]
                  )
                }
                className={`flex items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors active:opacity-70 ${
                  on ? "bg-good text-white" : "bg-sunk text-ink"
                }`}
              >
                <FlaskConical size={12} strokeWidth={2.2} />
                {lab}
              </button>
            );
          })}
        </div>
      </div>

      {saveError && (
        <div className="rounded-2xl bg-alertsoft p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-alert">
            <AlertTriangle size={16} strokeWidth={2.4} />
            Couldn’t save
          </p>
          <p className="mt-1 text-[13px] text-ink2">
            Nothing is lost — everything above is kept on this device. Check the connection and try
            again.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="btn w-full bg-primary py-3.5 text-[16px] text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : saveError ? "Try saving again" : "Save visit & prescription"}
      </button>
    </div>
  );
}
