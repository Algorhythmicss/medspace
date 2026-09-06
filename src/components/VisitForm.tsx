"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  RotateCw,
  X,
  FlaskConical,
  AlertTriangle,
  BookmarkPlus,
  Trash2,
} from "lucide-react";
import {
  createVisit,
  deletePrescriptionSet,
  savePrescriptionSet,
  type RxItemInput,
} from "@/app/actions";

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

type Vitals = { bpSys: string; bpDia: string; pulse: string; weight: string; tempF: string };

type Draft = {
  complaint: string;
  diagnosis: string;
  bpSys: string;
  bpDia: string;
  pulse: string;
  weight: string;
  tempF: string;
  items: RxItemInput[];
  advice: string;
  followUpInDays: number | null;
  labTasks: string[];
};

export type SavedPrescriptionSet = {
  id: string;
  name: string;
  advice: string | null;
  followUpInDays: number | null;
  labTasks: string[];
  items: RxItemInput[];
};

const EMPTY: Draft = {
  complaint: "",
  diagnosis: "",
  bpSys: "",
  bpDia: "",
  pulse: "",
  weight: "",
  tempF: "",
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
    !d.tempF &&
    d.items.length === 0 &&
    !d.advice.trim() &&
    d.followUpInDays === null &&
    d.labTasks.length === 0
  );
}

// Real clinical work, ignoring vitals — vitals alone are usually just the
// check-in reading the form pre-filled, not something the doctor typed, so a
// vitals-only saved draft shouldn't trigger the "restored what you typed" banner.
function hasWork(d: Draft) {
  return !!(
    d.complaint.trim() ||
    d.diagnosis.trim() ||
    d.items.length ||
    d.advice.trim() ||
    d.followUpInDays !== null ||
    d.labTasks.length
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
            ? "btn-primary"
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
  checkinVitals,
  initialSavedSets,
}: {
  patientId: string;
  lastRxItems: RxItemInput[];
  checkinVitals?: Vitals;
  initialSavedSets: SavedPrescriptionSet[];
}) {
  const draftKey = `medspace:visit-draft:${patientId}`;

  // Seed the vitals from the front desk's check-in reading. checkinVitals is a
  // server prop (same on server and client), so it's safe in the initializer —
  // no hydration mismatch, and no fighting the localStorage-restore effect.
  const [draft, setDraft] = useState<Draft>(() => ({ ...EMPTY, ...(checkinVitals ?? {}) }));
  const [restored, setRestored] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drugQuery, setDrugQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DrugSuggestion[]>([]);
  const [pending, startTransition] = useTransition();
  const [setPending, startSetTransition] = useTransition();
  const [savedSets, setSavedSets] = useState(initialSavedSets);
  const [setName, setSetName] = useState("");
  const [setNotice, setSetNotice] = useState<string | null>(null);
  const hydrated = useRef(false);
  const savingVisit = useRef(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Recover anything typed before a reload, crash, or failed save. With no
  // work-in-progress to restore, start from the vitals the front desk took at
  // check-in — measured once, never re-typed.
  useEffect(() => {
    // Restoring a localStorage draft after a reload/crash is exactly what an
    // on-mount effect is for — client-only state that can't be read during
    // render without a hydration mismatch. Only restore (and flag) real work; a
    // vitals-only autosave is just the check-in reading, already seeded above.
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Draft;
        if (hasWork(parsed)) {
          /* eslint-disable-next-line react-hooks/set-state-in-effect */
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
      if (savingVisit.current) return;
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

  function applySavedSet(saved: SavedPrescriptionSet) {
    const replacesWork =
      draft.items.length > 0 ||
      draft.advice.trim().length > 0 ||
      draft.labTasks.length > 0 ||
      draft.followUpInDays !== null;
    if (
      replacesWork &&
      !window.confirm("Replace the current medicines, advice, tests and follow-up with this saved set?")
    ) {
      return;
    }
    setDraft((current) => ({
      ...current,
      items: saved.items.map((item) => ({ ...item })),
      advice: saved.advice ?? "",
      followUpInDays: saved.followUpInDays,
      labTasks: [...saved.labTasks],
    }));
    setRestored(false);
    setSetNotice(`Applied “${saved.name}”. Review it before saving the visit.`);
  }

  function saveCurrentSet() {
    setSetNotice(null);
    startSetTransition(async () => {
      const result = await savePrescriptionSet({
        name: setName,
        items: draft.items,
        advice: draft.advice,
        followUpInDays: draft.followUpInDays ?? undefined,
        labTasks: draft.labTasks,
      });
      if (!result.ok) {
        setSetNotice(result.error);
        return;
      }
      setSavedSets((current) =>
        [...current.filter((item) => item.id !== result.set.id), result.set].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      );
      setSetName("");
      setSetNotice(`Saved “${result.set.name}” for future visits.`);
    });
  }

  function removeSavedSet(saved: SavedPrescriptionSet) {
    if (!window.confirm(`Remove the saved set “${saved.name}”?`)) return;
    setSetNotice(null);
    startSetTransition(async () => {
      const result = await deletePrescriptionSet(saved.id);
      if (!result.ok) {
        setSetNotice("The saved set could not be removed.");
        return;
      }
      setSavedSets((current) => current.filter((item) => item.id !== saved.id));
      setSetNotice(`Removed “${saved.name}”.`);
    });
  }

  function discardDraft() {
    // "Start fresh" means discard the doctor's interrupted work, not the
    // front desk's current check-in. Preserve those measured vitals so the
    // nurse-to-doctor handoff cannot be erased by recovery controls.
    setDraft({ ...EMPTY, ...(checkinVitals ?? {}) });
    setRestored(false);
    setSaveError(null);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  function submit() {
    setSaveError(null);
    savingVisit.current = true;
    startTransition(async () => {
      // Drop the local copy optimistically; a successful save redirects away
      // and the draft must not linger. Restored below if the save fails.
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      try {
        const result = await createVisit({
          patientId,
          complaint: draft.complaint.trim() || undefined,
          diagnosis: draft.diagnosis.trim() || undefined,
          vitals: {
            bpSys: draft.bpSys ? Number(draft.bpSys) : undefined,
            bpDia: draft.bpDia ? Number(draft.bpDia) : undefined,
            pulse: draft.pulse ? Number(draft.pulse) : undefined,
            weight: draft.weight ? Number(draft.weight) : undefined,
            tempF: draft.tempF ? Number(draft.tempF) : undefined,
          },
          items: draft.items,
          advice: draft.advice.trim() || undefined,
          followUpInDays: draft.followUpInDays ?? undefined,
          labTasks: draft.labTasks,
        });
        if (result && !result.ok) {
          savingVisit.current = false;
          try {
            localStorage.setItem(draftKey, JSON.stringify(draft));
          } catch {
            /* ignore */
          }
          setSaveError(result.error);
        }
      } catch (err) {
        // A successful action redirects, which surfaces here as a control-flow
        // signal — not a failure. Anything else means the save didn't land.
        const digest = (err as { digest?: string })?.digest ?? "";
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw err;
        savingVisit.current = false;
        try {
          localStorage.setItem(draftKey, JSON.stringify(draft));
        } catch {
          /* ignore */
        }
        setSaveError("The visit could not be saved. Check the connection and try again.");
      }
    });
  }

  return (
    <div className="space-y-6 pb-10">
      {restored && (
        <div className="flex items-center gap-2 rounded-2xl bg-perisoft px-4 py-3">
          <p className="flex-1 text-[13px] text-peri">
            Restored what you had typed for this patient.
          </p>
          <button
            type="button"
            onClick={discardDraft}
            className="shrink-0 text-[13px] font-semibold text-peri active:opacity-60"
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
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-perisoft px-4 py-3.5 text-[17px] font-semibold text-peri active:bg-perisoft"
        >
          <RotateCw size={18} strokeWidth={2.2} />
          Repeat last prescription ({lastRxItems.length} meds)
        </button>
      )}

      {savedSets.length > 0 && (
        <section>
          <div className="mb-2 px-1">
            <h3 className="label">Saved prescriptions</h3>
            <p className="t-micro mt-0.5 text-ink3">
              One tap fills medicines, advice, tests and follow-up. You still review everything.
            </p>
          </div>
          <div className="card rows overflow-hidden">
            {savedSets.map((saved) => (
              <div key={saved.id} className="flex min-h-12 items-center">
                <button
                  type="button"
                  onClick={() => applySavedSet(saved)}
                  className="pressable min-w-0 flex-1 px-4 py-3 text-left"
                >
                  <span className="t-body block truncate font-semibold">{saved.name}</span>
                  <span className="t-micro text-ink3">
                    {saved.items.length} medicine{saved.items.length === 1 ? "" : "s"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeSavedSet(saved)}
                  disabled={setPending}
                  aria-label={`Remove ${saved.name}`}
                  className="pressable mr-2 rounded-full p-2 text-ink3 disabled:opacity-40"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>
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
        <div className="grid grid-cols-5 gap-2">
          {(
            [
              ["Sys", "bpSys", "numeric"],
              ["Dia", "bpDia", "numeric"],
              ["Pulse", "pulse", "numeric"],
              ["Wt kg", "weight", "decimal"],
              ["°F", "tempF", "decimal"],
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
                  className="w-full px-4 py-2.5 text-left text-[15px] font-medium text-peri active:bg-black/5"
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
                  on ? "bg-jade text-white" : "bg-sunk text-ink"
                }`}
              >
                <FlaskConical size={12} strokeWidth={2.2} />
                {lab}
              </button>
            );
          })}
        </div>
      </div>

      {draft.items.length > 0 && (
        <section className="card p-4">
          <div className="flex items-start gap-3">
            <BookmarkPlus size={18} className="mt-0.5 shrink-0 text-peri" />
            <div className="min-w-0 flex-1">
              <p className="t-head">Use this combination again</p>
              <p className="t-cap mt-0.5 text-ink3">
                Saves the medicines plus current advice, tests and follow-up — never this patient’s diagnosis.
              </p>
            </div>
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={setName}
              onChange={(event) => setSetName(event.target.value)}
              maxLength={80}
              placeholder="Set name, e.g. DM review"
              aria-label="Saved prescription name"
              className="field ring-focus min-w-0 flex-1"
            />
            <button
              type="button"
              onClick={saveCurrentSet}
              disabled={setPending}
              className="btn btn-primary shrink-0 px-4 disabled:opacity-50"
            >
              {setPending ? "Saving…" : "Save set"}
            </button>
          </div>
          {setNotice && (
            <p aria-live="polite" className="t-cap mt-2 text-ink3">
              {setNotice}
            </p>
          )}
        </section>
      )}

      {saveError && (
        <div className="rounded-2xl bg-coralsoft p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-coral">
            <AlertTriangle size={16} strokeWidth={2.4} />
            Couldn’t save
          </p>
          <p className="mt-1 text-[13px] text-ink2">
            {saveError} Nothing is lost — everything above is kept on this device.
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={pending}
        className="btn w-full bg-peri py-3.5 text-[16px] text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : saveError ? "Try saving again" : "Save visit & prescription"}
      </button>
    </div>
  );
}
