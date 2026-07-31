"use client";

import { useTransition } from "react";
import { Check, X, ShieldCheck } from "lucide-react";
import { confirmPatientBinding, removePatientBinding } from "@/app/actions";

type Access = {
  id: string;
  email: string | null;
  status: string; // pending | active | revoked
  boundAt: string; // ISO — serialised for the client
  lastUsedAt: string | null;
};

// Doctor-side, in the chart rail. A Google account only opens this record on a
// return visit once the doctor confirms it here — because a plan link is
// forwardable and families share one account, the doctor is the authorization.
export default function LinkedAccounts({ access }: { access: Access[] }) {
  const [busy, start] = useTransition();
  if (access.length === 0) return null;

  return (
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <ShieldCheck size={15} className="text-peri" />
        <p className="t-head">Linked sign-in</p>
      </div>
      <p className="t-cap mt-0.5 text-ink3">
        Google accounts that can open this patient’s plan.
      </p>

      <div className="mt-3 space-y-2">
        {access.map((a) => (
          <div key={a.id} className="rounded-2xl bg-sunk px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="t-body min-w-0 flex-1 truncate">{a.email ?? "Google account"}</span>
              <span
                className={`t-micro shrink-0 font-medium ${a.status === "active" ? "text-jade" : "text-butter"}`}
              >
                {a.status === "active" ? "Confirmed" : "Awaiting you"}
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2">
              {a.status !== "active" && (
                <button
                  disabled={busy}
                  onClick={() => start(() => confirmPatientBinding(a.id))}
                  className="btn inline-flex items-center gap-1.5 bg-jade px-3 py-1.5 text-[13px] text-white disabled:opacity-50"
                >
                  <Check size={13} strokeWidth={2.4} /> This is them
                </button>
              )}
              <button
                disabled={busy}
                onClick={() => start(() => removePatientBinding(a.id))}
                className="btn inline-flex items-center gap-1.5 bg-surface px-3 py-1.5 text-[13px] text-coral disabled:opacity-50"
              >
                <X size={13} strokeWidth={2.4} /> Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
