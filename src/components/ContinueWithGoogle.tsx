"use client";

import { useState } from "react";
import { startPatientGoogleAuth } from "@/app/actions";

// The four-colour Google G — inline, since it isn't in lucide and no CDN is
// allowed. Keep it to the mark only: Google's brand rules want it on white/
// neutral, and a Google-blue button next to medSpace's periwinkle would fight
// the art, so the button chrome stays plain (.btn on surface, not .btn-primary).
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18c-.44-1.32-.69-2.73-.69-4.18s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export default function ContinueWithGoogle({
  planToken,
  lang = "en",
}: {
  planToken?: string;
  lang?: "en" | "hi";
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    const res = await startPatientGoogleAuth(planToken);
    if ("url" in res) {
      window.location.assign(res.url);
      return; // leaving the page; keep the button in its busy state
    }
    setBusy(false);
    setError(
      res.error === "expired"
        ? "This link has expired. Ask the clinic to send a new one."
        : "Google sign-in isn’t available right now. Please try again."
    );
  }

  return (
    <div>
      <button
        onClick={go}
        disabled={busy}
        className="btn inline-flex w-full items-center justify-center gap-2 bg-surface py-3 text-[15px] text-ink shadow-[var(--lift)] disabled:opacity-60"
      >
        <GoogleMark className="h-[18px] w-[18px] shrink-0" />
        {busy
          ? lang === "hi"
            ? "Google खोल रहे हैं…"
            : "Opening Google…"
          : lang === "hi"
            ? "Google से जारी रखें"
            : "Continue with Google"}
      </button>
      <p className="t-micro mt-2 px-1 text-ink3">
        {lang === "hi"
          ? "Google केवल अगली बार पहचान के लिए आपका अकाउंट और ईमेल बताता है। क्लिनिक इस जोड़ को मंज़ूर करता है; MedSpace आपका Drive या contacts नहीं पढ़ता।"
          : "Google only confirms your account and email for future access. The clinic must approve the link; MedSpace does not read your Drive or contacts."}
      </p>
      {error && <p className="t-cap mt-2 px-1 text-coral">{error}</p>}
    </div>
  );
}
