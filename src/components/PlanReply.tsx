"use client";

import { useState, useTransition } from "react";
import { Check, CalendarCheck, X } from "lucide-react";
import { recordPlanReply } from "@/app/actions";
import type { PlanReplyKind } from "@/lib/reach";
import { PLAN_TEXT, type PlanLang } from "@/lib/planText";

// One tap tells the clinic whether the patient is coming — so the doctor calls
// the person who said "can't come", not the one already booked. A fixed three
// options, never a chat. `planToken` is present on /p/<token>; on the signed-in
// /plan it is absent and the action falls back to the patient session.
export default function PlanReply({
  planToken,
  initial,
  lang = "en",
}: {
  planToken?: string;
  initial?: string | null;
  lang?: PlanLang;
}) {
  const t = PLAN_TEXT[lang];
  const options: { kind: PlanReplyKind; label: string; icon: typeof Check }[] = [
    { kind: "coming", label: t.replyComing, icon: Check },
    { kind: "booked", label: t.replyBooked, icon: CalendarCheck },
    { kind: "not_coming", label: t.replyCant, icon: X },
  ];
  const [reply, setReply] = useState<string | null>(initial ?? null);
  const [, start] = useTransition();

  function pick(kind: PlanReplyKind) {
    if (reply === kind) return;
    setReply(kind);
    start(() => recordPlanReply(kind, planToken));
  }

  return (
    <div className="card mt-3 p-4">
      <p className="t-cap text-ink2">{t.comingQ}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => {
          const on = reply === o.kind;
          const Icon = o.icon;
          return (
            <button
              key={o.kind}
              onClick={() => pick(o.kind)}
              data-on={on}
              className="chip inline-flex items-center gap-1.5 px-3.5 py-2 text-[14px]"
            >
              <Icon size={14} strokeWidth={2.4} />
              {o.label}
            </button>
          );
        })}
      </div>
      {reply && <p className="t-cap mt-2.5 text-jade">{t.replyThanks}</p>}
    </div>
  );
}
