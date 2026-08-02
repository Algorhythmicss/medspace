import Link from "next/link";
import type { PlanLang } from "@/lib/planText";

// A quiet EN / हिं switch. It sets ?lang on the current URL, so the plan
// re-renders server-side in that language — no client state, works on both
// /p/<token> and /plan. The doctor's saved default is used until the patient
// taps here.
export default function PlanLangToggle({ lang }: { lang: PlanLang }) {
  const opts: { code: PlanLang; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "hi", label: "हिं" },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 rounded-full bg-white/20 p-0.5 backdrop-blur-sm">
      {opts.map((o) => (
        <Link
          key={o.code}
          href={`?lang=${o.code}`}
          scroll={false}
          className={`rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
            lang === o.code ? "bg-white text-[color:var(--peri-2)]" : "text-white/85"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
