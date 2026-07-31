"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";
import { patientSignOut } from "@/app/actions";

// The shared-family-phone safeguard: whoever is signed in is always visible,
// and one tap ends it. Sits just under the greeting on the signed-in plan.
export default function PatientSignOut() {
  const [busy, start] = useTransition();
  return (
    <div className="mt-3 flex items-center justify-between gap-2 px-1">
      <p className="t-micro text-ink3">Signed in on this device</p>
      <button
        onClick={() => start(() => patientSignOut())}
        disabled={busy}
        className="t-cap inline-flex items-center gap-1 font-medium text-ink2 active:opacity-60 disabled:opacity-50"
      >
        <LogOut size={13} strokeWidth={2.2} /> {busy ? "Signing out…" : "Not you? Sign out"}
      </button>
    </div>
  );
}
