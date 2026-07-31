import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Clock,
  Pin,
  Ban,
  FileText,
} from "lucide-react";
import type { MemoryCard, MemoryLine } from "@/lib/memory";

const toneText: Record<string, string> = {
  alert: "text-ios-red",
  warn: "text-ios-orange",
  ok: "text-ios-green",
  info: "text-label2",
};

function LineIcon({ line }: { line: MemoryLine }) {
  const cls = `mt-0.5 shrink-0 ${toneText[line.tone]}`;
  const size = 16;
  if (line.kind === "trend")
    return line.text.includes("↓") ? (
      <TrendingDown size={size} className={cls} />
    ) : (
      <TrendingUp size={size} className={cls} />
    );
  if (line.kind === "gap") return <AlertTriangle size={size} className={cls} />;
  if (line.kind === "lastVisit") return <Clock size={size} className={cls} />;
  if (line.kind === "report") return <FileText size={size} className={cls} />;
  return <Pin size={size} className={cls} />;
}

// The 10-second glance. Everything the doctor needs before the patient sits down.
export default function MemoryCardView({ card }: { card: MemoryCard }) {
  return (
    <div className="rounded-2xl bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[15px] font-semibold">{card.headline}</span>
        {card.allergies.map((a) => (
          <span
            key={a}
            className="flex items-center gap-1 rounded-full bg-ios-red/10 px-2 py-0.5 text-[12px] font-semibold text-ios-red"
          >
            <Ban size={11} strokeWidth={2.5} /> {a}
          </span>
        ))}
      </div>
      <ul className="mt-3 space-y-2">
        {card.lines.map((line, i) => (
          <li key={i} className="flex gap-2.5 text-[15px] leading-snug">
            <LineIcon line={line} />
            <span
              className={
                line.tone === "alert"
                  ? "font-medium text-ios-red"
                  : line.tone === "warn"
                    ? "text-label"
                    : line.tone === "ok"
                      ? "text-label"
                      : "text-label2"
              }
            >
              {line.text}
            </span>
          </li>
        ))}
      </ul>
      {card.activeMeds.length > 0 && (
        <div className="mt-3 border-t-[0.5px] border-hairline pt-2.5 text-[13px] leading-relaxed text-label2">
          <span className="font-semibold">On:</span>{" "}
          {card.activeMeds.map((m) => m.drugName.replace(/^(Tab|Cap|Syp|Inh|Gel) /, "")).join(", ")}
        </div>
      )}
    </div>
  );
}
