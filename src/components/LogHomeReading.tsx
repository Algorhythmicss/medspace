"use client";

import { useState, useTransition } from "react";
import { Activity, Droplet, Scale, Check } from "lucide-react";
import { recordHomeReading } from "@/app/actions";
import { HOME_METRICS } from "@/lib/metrics";
import { PLAN_TEXT, type PlanLang } from "@/lib/planText";

const ICONS: Record<string, typeof Activity> = {
  bp: Activity,
  sugar: Droplet,
  weight: Scale,
};

// Lets a returning patient record a home BP / sugar / weight. Each entry flows
// to the doctor's chart tagged as self-logged. Deliberately three metrics, no
// history graph, no goals, no nagging — a logger, not a wellness app.
export default function LogHomeReading({
  planToken,
  lang = "en",
}: {
  planToken?: string;
  lang?: PlanLang;
}) {
  const t = PLAN_TEXT[lang];
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
      setError(t.errInvalid);
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
        setError(res.error === "expired" ? t.errExpired : t.errGeneric);
      }
    });
  }

  return (
    <section className="mt-6">
      <div className="mb-2 flex items-center gap-2 px-1">
        <Activity size={16} className="text-peri" />
        <h2 className="t-head">{t.homeTitle}</h2>
      </div>
      <div className="card p-4">
        <p className="t-cap text-ink3">{t.homeSub}</p>

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
                <Icon size={14} strokeWidth={2.2} />{" "}
                {t.homeMetric[m.key as keyof typeof t.homeMetric] ?? m.label.replace(" (fasting)", "")}
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
                {pending ? t.saving : t.save}
              </button>
            </div>
            {error && <p className="t-cap mt-1.5 px-1 text-coral">{error}</p>}
          </div>
        ))}

        {saved && (
          <p className="t-cap mt-3 inline-flex items-center gap-1.5 text-jade">
            <Check size={14} strokeWidth={2.4} /> {t.homeSaved}
          </p>
        )}
      </div>
    </section>
  );
}
