import {
  CheckCircle2,
  MessageCircle,
  RefreshCw,
  Stethoscope,
} from "lucide-react";
import type { PracticePulse } from "@/lib/continuity";

const ITEMS = [
  {
    key: "consultations",
    label: "Consults recorded",
    Icon: Stethoscope,
    tone: "bg-perisoft text-peri",
  },
  {
    key: "repeatVisits",
    label: "Repeat visits",
    Icon: RefreshCw,
    tone: "bg-tealsoft text-teal",
  },
  {
    key: "followUpsClosed",
    label: "Follow-ups closed",
    Icon: CheckCircle2,
    tone: "bg-jadesoft text-jade",
  },
  {
    key: "plansOpened",
    label: "Patients opening plans",
    Icon: MessageCircle,
    tone: "bg-buttersoft text-butter",
  },
] as const;

export default function PracticePulse({ pulse }: { pulse: PracticePulse }) {
  return (
    <section className="mt-6">
      <div className="mb-2 flex items-end justify-between px-1">
        <div>
          <h2 className="label">Clinic pulse</h2>
          <p className="t-micro mt-0.5 text-ink3">
            Last {pulse.days} days · the pilot baseline
          </p>
        </div>
        <span className="t-micro text-ink3">Recorded, not estimated</span>
      </div>

      <div className="card grid grid-cols-2 overflow-hidden lg:grid-cols-4">
        {ITEMS.map(({ key, label, Icon, tone }, index) => (
          <div
            key={key}
            className={`p-4 ${index % 2 ? "border-l border-hairline" : ""} ${
              index > 1 ? "border-t border-hairline lg:border-t-0" : ""
            } ${index > 0 ? "lg:border-l lg:border-hairline" : ""}`}
          >
            <span
              className={`mb-3 flex h-9 w-9 items-center justify-center rounded-2xl ${tone}`}
            >
              <Icon size={16} strokeWidth={2.2} />
            </span>
            <p className="t-num t-title">{pulse[key]}</p>
            <p className="t-cap text-ink3">{label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
