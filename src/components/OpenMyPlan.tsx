"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";

// Patients arrive by tapping their WhatsApp link, so this is the fallback for
// someone who has the link but is typing the address by hand — or who pasted
// the message into a browser. It accepts either the whole URL or just the
// token, because people paste whatever they have.
export default function OpenMyPlan() {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function open() {
    const raw = value.trim();
    if (!raw) return;

    // pull the token out of a full link, a bare path, or a naked token
    const fromUrl = raw.match(/\/p\/([A-Za-z0-9._-]+)/);
    const token = fromUrl ? fromUrl[1] : /^[A-Za-z0-9._-]+$/.test(raw) ? raw : null;

    if (!token) {
      setError("That doesn’t look like your care plan link. Paste the whole message link.");
      return;
    }
    setError(null);
    router.push(`/p/${token}`);
  }

  return (
    <div>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && open()}
          placeholder="Paste your link from WhatsApp"
          inputMode="url"
          autoComplete="off"
          className="field ring-focus min-w-0 flex-1"
        />
        <button
          onClick={open}
          aria-label="Open my care plan"
          className="btn btn-primary shrink-0 px-4"
        >
          <ArrowRight size={18} strokeWidth={2.4} />
        </button>
      </div>
      {error && <p className="t-cap mt-2 px-1 text-coral">{error}</p>}
    </div>
  );
}
