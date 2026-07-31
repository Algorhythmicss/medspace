"use client";

import { useRef, useState, useTransition } from "react";
import { MessageCircle, Copy, Check, Phone } from "lucide-react";
import { recordPlanShare, resetPatientLinks } from "@/app/actions";
import { copyText } from "@/lib/clipboard";
import type { PlanReach } from "@/lib/reach";

const TONE: Record<PlanReach["tone"], string> = {
  ok: "text-jade",
  warn: "text-butter",
  muted: "text-ink3",
};

// Sending the plan link uses the doctor's *own* WhatsApp via a wa.me deep
// link — no Business API, no Meta verification, no per-message cost, nothing
// to register. That is what makes a 100-patient pilot possible this week.
// The copy button covers SMS, a different messenger, or reading it aloud.
export default function SendPlanLink({
  waHref,
  telHref,
  planUrl,
  patientId,
  reach,
}: {
  waHref: string | null;
  telHref: string | null;
  planUrl: string;
  patientId: string;
  reach: PlanReach;
}) {
  const [copied, setCopied] = useState(false);
  const [justSent, setJustSent] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, startReset] = useTransition();
  const linkBox = useRef<HTMLInputElement>(null);

  // Optimistic: the doctor has just handed the link over, so don't keep
  // telling them it was never sent until the page happens to reload.
  const label = justSent && reach.state !== "opened" ? "Sent just now" : reach.label;
  const tone = justSent && reach.state !== "opened" ? "muted" : reach.tone;

  function share() {
    setJustSent(true);
    void recordPlanShare(patientId);
  }

  async function copy() {
    // Either outcome counts as handing the link over — the doctor asked for it.
    share();
    if (await copyText(planUrl)) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    // Both clipboard paths failed. Never fail silently here: show the link so
    // it can be selected by hand, which is what the doctor would do anyway.
    setRevealed(true);
    requestAnimationFrame(() => linkBox.current?.select());
  }

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="t-head">Patient’s plan link</p>
        <span className={`t-micro shrink-0 ${TONE[tone]}`}>{label}</span>
      </div>
      <p className="t-cap mt-0.5 text-ink3">
        Their medicines, tests and next visit — no app to install.
      </p>

      <div className="mt-3 flex gap-2">
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            onClick={share}
            className="btn inline-flex flex-1 items-center justify-center gap-1.5 bg-jade py-2.5 text-[14px] text-white"
          >
            <MessageCircle size={15} strokeWidth={2.2} /> Send on WhatsApp
          </a>
        ) : (
          <span className="t-cap flex-1 rounded-full bg-sunk py-2.5 text-center text-ink3">
            No mobile number on file
          </span>
        )}
        <button
          onClick={copy}
          className="btn inline-flex items-center gap-1.5 bg-sunk px-4 py-2.5 text-[14px] text-ink"
        >
          {copied ? <Check size={15} strokeWidth={2.4} /> : <Copy size={15} strokeWidth={2.2} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {revealed && (
        <div className="mt-3">
          <p className="t-cap mb-1.5 text-ink3">
            Copying isn’t allowed here — select this link and copy it.
          </p>
          <input
            ref={linkBox}
            readOnly
            value={planUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="field ring-focus w-full text-[13px]"
          />
        </div>
      )}

      {/* Repeated links to someone who never opens them are wasted follow-up.
          Say so once, and put the phone within reach. */}
      {reach.callFirst && !justSent && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-sunk px-3 py-2.5">
          <p className="t-cap min-w-0 flex-1 text-ink2">
            Not opening links — try a call.
          </p>
          {telHref && (
            <a
              href={telHref}
              className="btn inline-flex shrink-0 items-center gap-1.5 bg-surface px-3 py-1.5 text-[13px] text-ink"
            >
              <Phone size={13} strokeWidth={2.2} /> Call
            </a>
          )}
        </div>
      )}

      {/* Sent to the wrong number? Cut the old link without touching anyone
          else. Two-step because it can't be undone — the sent link goes dead. */}
      <div className="mt-3 border-t border-hairline pt-2.5">
        {confirmReset ? (
          <div className="flex items-center justify-between gap-2">
            <p className="t-micro min-w-0 flex-1 text-ink3">
              The link already sent will stop working.
            </p>
            <button
              onClick={() => setConfirmReset(false)}
              className="t-micro shrink-0 font-medium text-ink2 active:opacity-60"
            >
              Cancel
            </button>
            <button
              disabled={resetting}
              onClick={() =>
                startReset(async () => {
                  await resetPatientLinks(patientId);
                  setConfirmReset(false);
                  setRevealed(false);
                })
              }
              className="t-micro shrink-0 font-semibold text-coral active:opacity-60 disabled:opacity-50"
            >
              {resetting ? "Resetting…" : "Reset link"}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="t-micro font-medium text-ink3 active:opacity-60"
          >
            Sent to the wrong number? Reset the link
          </button>
        )}
      </div>
    </div>
  );
}
