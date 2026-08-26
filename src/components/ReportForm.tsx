"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X, Paperclip, AlertTriangle } from "lucide-react";
import { createReport } from "@/app/actions";
import { REPORT_METRICS } from "@/lib/metrics";

const KINDS = [
  { value: "lab", label: "Lab" },
  { value: "imaging", label: "Imaging" },
  { value: "outside_rx", label: "Outside Rx" },
  { value: "other", label: "Other" },
];

const fieldCls =
  "field";

type MetricValue = { type: string; label: string; unit: string; value: string };
type Draft = {
  title: string;
  reportDate: string;
  kind: string;
  summary: string;
  values: MetricValue[];
};

export default function ReportForm({ patientId }: { patientId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const draftKey = `medspace:report-draft:${patientId}`;

  const [draft, setDraft] = useState<Draft>({
    title: "",
    reportDate: today,
    kind: "lab",
    summary: "",
    values: [],
  });
  const [restored, setRestored] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const hydrated = useRef(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const isEmpty = (d: Draft) =>
    !d.title.trim() && !d.summary.trim() && d.values.length === 0;

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        const raw = localStorage.getItem(draftKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Draft;
          if (!isEmpty(parsed)) {
            setDraft({
              ...{ title: "", reportDate: today, kind: "lab", summary: "", values: [] },
              ...parsed,
            });
            setRestored(true);
          }
        }
      } catch {
        // corrupt draft — ignore
      }
      hydrated.current = true;
    }, 0);
    return () => window.clearTimeout(restore);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      try {
        if (isEmpty(draft)) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, JSON.stringify(draft));
      } catch {
        /* storage blocked */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [draft, draftKey]);

  function addMetric(m: (typeof REPORT_METRICS)[number]) {
    if (draft.values.some((v) => v.type === m.type)) return;
    set("values", [...draft.values, { ...m, value: "" }]);
  }

  function discardDraft() {
    setDraft({ title: "", reportDate: today, kind: "lab", summary: "", values: [] });
    setRestored(false);
    setSaveError(false);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      /* ignore */
    }
  }

  function submit(formData: FormData) {
    setSaveError(false);
    formData.set(
      "values",
      JSON.stringify(
        draft.values
          .filter((v) => v.value.trim() !== "" && Number.isFinite(Number(v.value)))
          .map((v) => ({ type: v.type, value: Number(v.value) }))
      )
    );
    startTransition(async () => {
      // dropped optimistically; a successful save redirects away
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* ignore */
      }
      try {
        await createReport(formData);
      } catch (err) {
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
    <form action={submit} className="space-y-5 pb-10">
      <input type="hidden" name="patientId" value={patientId} />

      {restored && (
        <div className="flex items-center gap-2 rounded-2xl bg-perisoft px-4 py-3">
          <p className="flex-1 text-[13px] text-peri">
            Restored the report you were entering.
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

      <div className="space-y-2.5">
        <input
          name="title"
          required
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Report name (e.g. Thyrocare full panel)"
          className={fieldCls}
        />
        <input
          name="reportDate"
          type="date"
          value={draft.reportDate}
          onChange={(e) => set("reportDate", e.target.value)}
          max={today}
          className={fieldCls}
        />
        {/* full width and wrapping: beside the date these clipped, so
            "Outside Rx" and "Other" could not be reached at all */}
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => set("kind", k.value)}
              data-on={draft.kind === k.value}
              className="chip"
            >
              {k.label}
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={draft.kind} />
      </div>

      <div>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-sunk py-3 text-[15px] font-medium text-ink active:opacity-70"
        >
          <Paperclip size={16} />
          {fileName ?? "Attach photo / PDF (optional)"}
        </button>
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
        />
        {restored && (
          <p className="mt-1.5 px-1 text-[12px] text-ink2">
            Browsers can’t restore a chosen file — re-attach it if you had one.
          </p>
        )}
      </div>

      <div>
        <h3 className="label mb-2 px-1">
          Key values — feed the trends
        </h3>
        {draft.values.length > 0 && (
          <ul className="mb-2.5 space-y-2">
            {draft.values.map((v, i) => (
              <li
                key={v.type}
                className="flex items-center gap-2.5 card p-2.5"
              >
                <span className="w-28 shrink-0 text-[15px]">{v.label}</span>
                <input
                  value={v.value}
                  onChange={(e) =>
                    set(
                      "values",
                      draft.values.map((x, idx) =>
                        idx === i ? { ...x, value: e.target.value } : x
                      )
                    )
                  }
                  inputMode="decimal"
                  placeholder="value"
                  className="min-w-0 flex-1 rounded-lg bg-sunk px-3 py-2 text-[17px] outline-none"
                />
                <span className="w-14 shrink-0 text-[13px] text-ink2">{v.unit}</span>
                <button
                  type="button"
                  onClick={() =>
                    set(
                      "values",
                      draft.values.filter((_, idx) => idx !== i)
                    )
                  }
                  className="shrink-0 rounded-full bg-sunk p-1 text-ink2"
                >
                  <X size={13} strokeWidth={2.5} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          {REPORT_METRICS.filter((m) => !draft.values.some((v) => v.type === m.type)).map((m) => (
            <button
              key={m.type}
              type="button"
              onClick={() => addMetric(m)}
              className="rounded-full bg-sunk px-3 py-1.5 text-[13px] font-medium text-ink active:opacity-70"
            >
              + {m.label}
            </button>
          ))}
        </div>
      </div>

      <input
        name="summary"
        value={draft.summary}
        onChange={(e) => set("summary", e.target.value)}
        placeholder="Summary note (optional)"
        className={fieldCls}
      />

      {saveError && (
        <div className="rounded-2xl bg-coralsoft p-4">
          <p className="flex items-center gap-2 text-[15px] font-semibold text-coral">
            <AlertTriangle size={16} strokeWidth={2.4} />
            Couldn’t save
          </p>
          <p className="mt-1 text-[13px] text-ink2">
            Nothing is lost — the values above are kept on this device. Check the connection and try
            again.
          </p>
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn w-full bg-peri py-3.5 text-[16px] text-white disabled:opacity-50"
      >
        {pending ? "Saving…" : saveError ? "Try saving again" : "Save report"}
      </button>
    </form>
  );
}
