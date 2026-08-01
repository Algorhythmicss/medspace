"use client";

import { useState, useTransition } from "react";
import { Activity, Droplet, Scale, Check } from "lucide-react";
import { recordHomeReading } from "@/app/actions";
import { HOME_METRICS } from "@/lib/metrics";

const ICONS: Record<string, typeof Activity> = {
  bp: Activity,
  sugar: Droplet,
  weight: Scale,
};

// Lets a returning patient record a home BP / sugar / weight. Each entry flows
// to the doctor's chart tagged as self-logged. Deliberately three metrics, no
// history graph, no goals, no nagging — a logger, not a wellness app.
export default function LogHomeReading({ planToken }: { planToken?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function choose(key: string) {
    setOpen(open === key ? null : key);
    setVals({});
    setError(null);
  }

  function save(metric: (typeof HOME_METRICS)[number]) {
    const values: Record<string, number> = {};
    for (const f of metric.fields) values[f.type] = Number(vals[f.type]);
    if (metric.fields.some((f) => !vals[f.type] || !Number.isFinite(values[f.type]) || values[f.type] <= 0)) {
      setError("Please enter a valid number.");
      return;
    }
    start(async () => {
      const res = await recordHomeReading(metric.key, values, planToken);
      if ("ok" in res) {
        setSaved(true);
        setOpen(null);
        setVals({});
        setTimeout(() => setSaved(false), 3000);
      } else {
        setError(res.error === "expired" ? "This link has expired." : "Couldn’t save — try again.");
      }
    });
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Activity size={16} className="text-peri" />
        <h2 className="t-head">Log a home reading</h2>
      </div>
      <div className="card p-4">
        <p className="t-cap text-ink3">
          Taken your BP, sugar or weight at home? Add it here — your doctor sees it at your next visit.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {HOME_METRICS.map((m) => {
            const Icon = ICONS[m.key];
            return (
              <button
                key={m.key}
                onClick={() => choose(m.key)}
                data-on={open === m.key}
                className="chip inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px]"
              >
                <Icon size={14} strokeWidth={2.2} /> {m.label.replace(" (fasting)", "")}
              </button>
            );
          })}
        </div>

        {HOME_METRICS.filter((m) => m.key === open).map((m) => (
          <div key={m.key} className="mt-3">
            <div className="flex items-center gap-2">
              {m.fields.map((f) => (
                <input
                  key={f.type}
                  inputMode="numeric"
                  placeholder={f.placeholder}
                  value={vals[f.type] ?? ""}
                  onChange={(e) => {
                    setVals((v) => ({ ...v, [f.type]: e.target.value.replace(/[^\d.]/g, "") }));
                    setError(null);
                  }}
                  className="field ring-focus min-w-0 flex-1 text-center"
                />
              ))}
              <span className="t-cap shrink-0 text-ink3">{m.unit}</span>
              <button
                onClick={() => save(m)}
                disabled={pending}
                className="btn btn-primary shrink-0 px-4 py-2.5 text-[14px] disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save"}
              </button>
            </div>
            {error && <p className="t-cap mt-1.5 px-1 text-coral">{error}</p>}
          </div>
        ))}

        {saved && (
          <p className="t-cap mt-3 inline-flex items-center gap-1.5 text-jade">
            <Check size={14} strokeWidth={2.4} /> Saved — your doctor will see it.
          </p>
        )}
      </div>
    </section>
  );
}
