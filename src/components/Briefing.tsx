import { Ban } from "lucide-react";
import type { MemoryCard, MemoryLine } from "@/lib/memory";
import Sparkline from "@/components/Sparkline";
import StickyNoteEditor from "@/components/StickyNoteEditor";

// The briefing: everything the doctor needs before the patient sits down,
// in one card instead of four competing sections.
//
// Hierarchy does the work that colour used to. The single most urgent finding
// is stated large with a coloured rail; everything else recedes. Trends live
// here as compact chips rather than a separate row, so the eye lands once.

const toneRail: Record<MemoryLine["tone"], string> = {
  alert: "bg-alert",
  warn: "bg-warn",
  ok: "bg-good",
  info: "bg-ink3",
};

// The rail carries urgency. Colouring the sentence too would be triple
// encoding (size + colour + rail) and reads as shouting; ink stays calmer
// and, counterintuitively, more serious.

export default function Briefing({
  card,
  patientId,
  note,
}: {
  card: MemoryCard;
  patientId: string;
  note: string | null;
}) {
  const [lead, ...rest] = card.lines;

  return (
    <section className="card-lg rise overflow-hidden">
      <div className="p-5">
        {/* who, at a glance */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[14px] text-ink2">{card.headline}</span>
          {card.allergies.map((a) => (
            <span
              key={a}
              className="inline-flex items-center gap-1 rounded-full bg-alertsoft px-2 py-0.5 text-[12px] font-semibold text-alert"
            >
              <Ban size={11} strokeWidth={2.6} />
              {a}
            </span>
          ))}
        </div>

        {/* the one thing that matters most */}
        {lead && (
          <div className="mt-3.5 flex gap-3">
            <span className={`mt-0.5 w-[3px] shrink-0 rounded-full ${toneRail[lead.tone]}`} />
            <p className="font-display text-[18px] font-semibold leading-[1.35] tracking-[-0.01em] text-ink">
              {lead.text}
            </p>
          </div>
        )}

        {/* supporting context, deliberately quiet */}
        {rest.length > 0 && (
          <ul className="mt-2.5 space-y-1.5 pl-[15px]">
            {rest.map((line, i) => (
              <li key={i} className="text-[14px] leading-snug text-ink2">
                <span
                  className={`mr-2 inline-block h-1 w-1 -translate-y-[3px] rounded-full align-middle ${toneRail[line.tone]}`}
                />
                {line.text}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* trends, inline — no separate section to scan */}
      {card.metrics.length > 0 && (
        <div className="flex gap-2 overflow-x-auto px-5 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {card.metrics.map((m) => (
            <div
              key={m.type}
              className="min-w-[104px] shrink-0 rounded-2xl bg-sunk px-3 py-2.5"
            >
              <div className="text-[11.5px] font-medium text-ink3">{m.label}</div>
              <div className="tnum font-display text-[17px] font-semibold leading-tight">
                {m.paired
                  ? `${m.latest.toFixed(0)}/${m.paired}`
                  : m.latest.toFixed(m.decimals)}
                {m.unit && !m.paired && (
                  <span className="ml-1 text-[10.5px] font-normal text-ink3">{m.unit}</span>
                )}
              </div>
              <div className="mt-1">
                <Sparkline
                  points={m.points}
                  higherIsWorse={m.higherIsWorse}
                  minDelta={m.minDelta}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* current medication, as a quiet footer */}
      {card.activeMeds.length > 0 && (
        <div className="border-t border-hairline px-5 py-3">
          <p className="text-[13px] leading-relaxed text-ink2">
            <span className="font-semibold text-ink">On</span>{" "}
            {card.activeMeds
              .map((m) => m.drugName.replace(/^(Tab|Cap|Syp|Inh|Gel) /, ""))
              .join(" · ")}
          </p>
        </div>
      )}

      {/* durable human context, editable in place */}
      <div className="border-t border-hairline">
        <StickyNoteEditor patientId={patientId} note={note} />
      </div>
    </section>
  );
}
