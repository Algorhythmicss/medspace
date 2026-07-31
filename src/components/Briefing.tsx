import { Ban } from "lucide-react";
import type { MemoryCard, MemoryLine } from "@/lib/memory";
import Sparkline from "@/components/Sparkline";
import StickyNoteEditor from "@/components/StickyNoteEditor";

// The briefing hero: everything the doctor needs before the patient sits
// down, as one filled object rather than four stacked sections.
//
// Colour is allowed to be loud here and nowhere else. The lead finding is
// stated large in light ink on night blue; supporting context recedes into
// the blue. Trends sit inside as translucent tiles.

const dot: Record<MemoryLine["tone"], string> = {
  alert: "bg-coral",
  warn: "bg-sunny",
  ok: "bg-mint",
  info: "bg-nightink2",
};

export default function Briefing({
  card,
  patientId,
  note,
  name,
  fileNumber,
}: {
  card: MemoryCard;
  patientId: string;
  note: string | null;
  name: string;
  fileNumber: number;
}) {
  const [lead, ...rest] = card.lines;

  return (
    <section className="rise">
      <div className="hero px-5 pb-5 pt-5">
        {/* who */}
        <div className="relative">
          <h1 className="font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-white">
            {name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <span className="tnum text-[13.5px] text-nightink2">
              #{fileNumber} · {card.headline}
            </span>
            {card.allergies.map((a) => (
              <span
                key={a}
                className="inline-flex items-center gap-1 rounded-full bg-coral/25 px-2 py-0.5 text-[12px] font-semibold text-white"
              >
                <Ban size={11} strokeWidth={2.8} />
                {a}
              </span>
            ))}
          </div>
        </div>

        {/* the one thing that matters most */}
        {lead && (
          <p className="relative mt-4 font-display text-[21px] font-bold leading-[1.28] tracking-[-0.015em] text-white">
            {lead.text}
          </p>
        )}

        {/* supporting context */}
        {rest.length > 0 && (
          <ul className="relative mt-3 space-y-1.5">
            {rest.map((line, i) => (
              <li key={i} className="flex gap-2.5 text-[14.5px] leading-snug text-nightink">
                <span
                  className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${dot[line.tone]}`}
                />
                <span className="opacity-90">{line.text}</span>
              </li>
            ))}
          </ul>
        )}

        {/* trends, inline as translucent tiles */}
        {card.metrics.length > 0 && (
          <div className="relative -mx-1 mt-4 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {card.metrics.map((m) => (
              <div
                key={m.type}
                className="min-w-[108px] shrink-0 rounded-2xl bg-white/10 px-3 py-2.5 backdrop-blur-sm"
              >
                <div className="text-[11.5px] font-medium text-nightink2">{m.label}</div>
                <div className="tnum font-display text-[18px] font-bold leading-tight text-white">
                  {m.paired
                    ? `${m.latest.toFixed(0)}/${m.paired}`
                    : m.latest.toFixed(m.decimals)}
                  {m.unit && !m.paired && (
                    <span className="ml-1 text-[10.5px] font-medium text-nightink2">
                      {m.unit}
                    </span>
                  )}
                </div>
                <div className="mt-1">
                  <Sparkline
                    points={m.points}
                    higherIsWorse={m.higherIsWorse}
                    minDelta={m.minDelta}
                    onDark
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* current medication */}
        {card.activeMeds.length > 0 && (
          <p className="relative mt-4 border-t border-white/12 pt-3 text-[13px] leading-relaxed text-nightink2">
            <span className="font-semibold text-nightink">On</span>{" "}
            {card.activeMeds
              .map((m) => m.drugName.replace(/^(Tab|Cap|Syp|Inh|Gel) /, ""))
              .join(" · ")}
          </p>
        )}
      </div>

      {/* durable human context, on cream so it reads as a margin note */}
      <StickyNoteEditor patientId={patientId} note={note} />
    </section>
  );
}
