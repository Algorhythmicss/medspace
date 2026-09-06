"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { updatePatient } from "@/app/actions";

type PatientDetailsDraft = {
  name: string;
  phone: string;
  age: string;
  sex: string;
  address: string;
  abhaId: string;
  language: "en" | "hi";
};

const fieldCls = "field ring-focus w-full";

export default function PatientDetailsForm({
  patientId,
  initial,
}: {
  patientId: string;
  initial: PatientDetailsDraft;
}) {
  const draftKey = `medspace:patient-details-draft:${patientId}`;
  const [draft, setDraft] = useState(initial);
  const [restored, setRestored] = useState(false);
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();
  const hydrated = useRef(false);
  const submitting = useRef(false);
  const initialJson = JSON.stringify(initial);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw && raw !== initialJson) {
        const parsed = JSON.parse(raw) as PatientDetailsDraft;
        if (parsed.name) {
          /* eslint-disable-next-line react-hooks/set-state-in-effect */
          setDraft((current) => ({ ...current, ...parsed }));
          setRestored(true);
        }
      } else if (raw === initialJson) {
        localStorage.removeItem(draftKey);
      }
    } catch {
      // A corrupt draft should not block editing.
    }
    hydrated.current = true;
  }, [draftKey, initialJson]);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      if (submitting.current) return;
      try {
        const serialized = JSON.stringify(draft);
        if (serialized === initialJson) localStorage.removeItem(draftKey);
        else localStorage.setItem(draftKey, serialized);
      } catch {
        // The live form remains usable if local storage is unavailable.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, draftKey, initialJson]);

  const set = <K extends keyof PatientDetailsDraft>(key: K, value: PatientDetailsDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function discard() {
    setDraft(initial);
    setRestored(false);
    setError(false);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore unavailable local storage.
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(false);
    submitting.current = true;
    startTransition(async () => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Ignore unavailable local storage.
      }
      try {
        await updatePatient(formData);
      } catch (cause) {
        const digest = (cause as { digest?: string })?.digest ?? "";
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw cause;
        submitting.current = false;
        try {
          localStorage.setItem(draftKey, JSON.stringify(draft));
        } catch {
          // The typed values remain in component state.
        }
        setError(true);
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <input type="hidden" name="patientId" value={patientId} />
      {restored && (
        <div className="mb-3 flex items-center gap-2 rounded-2xl bg-perisoft px-4 py-3">
          <p className="t-cap flex-1 text-peri">Restored the details you were editing.</p>
          <button type="button" onClick={discard} className="t-cap font-semibold text-peri">
            Discard
          </button>
        </div>
      )}
      <input
        name="name"
        required
        maxLength={160}
        value={draft.name}
        onChange={(event) => set("name", event.target.value)}
        placeholder="Full name"
        className={fieldCls}
      />
      <input
        name="phone"
        value={draft.phone}
        onChange={(event) => set("phone", event.target.value)}
        placeholder="Phone (WhatsApp)"
        inputMode="tel"
        className={fieldCls}
      />
      <div className="grid grid-cols-2 gap-2.5">
        <input
          name="age"
          value={draft.age}
          onChange={(event) => set("age", event.target.value)}
          placeholder="Age"
          inputMode="numeric"
          className={fieldCls}
        />
        <select
          name="sex"
          value={draft.sex}
          onChange={(event) => set("sex", event.target.value)}
          className={fieldCls}
        >
          <option value="">Sex</option>
          <option value="M">Male</option>
          <option value="F">Female</option>
          <option value="O">Other</option>
        </select>
      </div>
      <input
        name="address"
        value={draft.address}
        onChange={(event) => set("address", event.target.value)}
        placeholder="Address"
        className={fieldCls}
      />
      <input
        name="abhaId"
        value={draft.abhaId}
        onChange={(event) => set("abhaId", event.target.value)}
        placeholder="ABHA number (optional)"
        className={fieldCls}
      />
      <label className="block">
        <span className="t-cap mb-1 block px-1 font-medium text-ink3">
          Plan language — the language their plan opens in
        </span>
        <select
          name="language"
          value={draft.language}
          onChange={(event) => set("language", event.target.value === "hi" ? "hi" : "en")}
          className={fieldCls}
        >
          <option value="en">English</option>
          <option value="hi">हिन्दी · Hindi</option>
        </select>
      </label>
      {error && (
        <p role="alert" className="t-cap flex items-center gap-2 rounded-2xl bg-coralsoft px-4 py-3 text-coral">
          <AlertTriangle size={15} /> Couldn’t save. Your changes are kept on this device.
        </p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary mt-2 w-full py-3.5 disabled:opacity-60">
        {pending ? "Saving…" : error ? "Try saving again" : "Save changes"}
      </button>
    </form>
  );
}
