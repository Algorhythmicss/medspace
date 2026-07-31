"use client";

import { useState } from "react";
import { MessageCircle, Copy, Check } from "lucide-react";

// Sending the plan link uses the doctor's *own* WhatsApp via a wa.me deep
// link — no Business API, no Meta verification, no per-message cost, nothing
// to register. That is what makes a 100-patient pilot possible this week.
// The copy button covers SMS, a different messenger, or reading it aloud.
export default function SendPlanLink({
  waHref,
  planUrl,
  opened,
}: {
  waHref: string | null;
  planUrl: string;
  opened: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(planUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — the link is still visible to select by hand
    }
  }

  return (
    <div className="card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="t-head">Patient’s plan link</p>
        <span className={`t-micro ${opened ? "text-jade" : "text-ink3"}`}>
          {opened ? "Opened" : "Not opened yet"}
        </span>
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
    </div>
  );
}
