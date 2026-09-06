"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, FileCheck2 } from "lucide-react";
import { createMedicalDocument, type MedicalDocumentState } from "@/app/actions";
import {
  MEDICAL_DOCUMENT_KINDS,
  MEDICAL_DOCUMENT_LABELS,
  medicalDocumentDraft,
  documentDate,
  type MedicalDocumentKind,
} from "@/lib/medicalDocuments";

type VisitOption = {
  id: string;
  visitDate: string;
  complaint: string | null;
  diagnosis: string | null;
};

type Draft = {
  kind: MedicalDocumentKind;
  visitId: string;
  title: string;
  body: string;
  recipient: string;
  validFrom: string;
  validUntil: string;
  doctorConfirmed: boolean;
};

const INITIAL_RESULT: MedicalDocumentState = { ok: false, message: "" };

export default function MedicalDocumentForm({
  patientId,
  patientName,
  clinicName,
  today,
  visits,
}: {
  patientId: string;
  patientName: string;
  clinicName: string;
  today: string;
  visits: VisitOption[];
}) {
  const draftKey = `medspace:document-draft:${patientId}`;
  const firstVisit = visits[0];
  const makeBody = (kind: MedicalDocumentKind, visitId: string, current: Draft) => {
    const visit = visits.find((item) => item.id === visitId) ?? firstVisit;
    return medicalDocumentDraft({
      kind,
      patientName,
      clinicName,
      examinedOn: visit ? documentDate(visit.visitDate) : documentDate(`${today}T12:00:00+05:30`),
      validFrom: current.validFrom,
      validUntil: current.validUntil,
      complaint: visit?.complaint,
      diagnosis: visit?.diagnosis,
    });
  };
  const [draft, setDraft] = useState<Draft>(() => {
    const seed: Draft = {
      kind: "sick_leave",
      visitId: firstVisit?.id ?? "",
      title: MEDICAL_DOCUMENT_LABELS.sick_leave,
      body: "",
      recipient: "",
      validFrom: today,
      validUntil: today,
      doctorConfirmed: false,
    };
    return { ...seed, body: makeBody("sick_leave", seed.visitId, seed) };
  });
  const [restored, setRestored] = useState(false);
  const [result, setResult] = useState(INITIAL_RESULT);
  const [pending, startTransition] = useTransition();
  const hydrated = useRef(false);
  const submitting = useRef(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Draft>;
        if (parsed.body || parsed.title) {
          /* eslint-disable-next-line react-hooks/set-state-in-effect */
          setDraft((current) => ({ ...current, ...parsed, doctorConfirmed: false }));
          setRestored(true);
        }
      }
    } catch {
      // A corrupt local draft must never block document issue.
    }
    hydrated.current = true;
  }, [draftKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    const timer = setTimeout(() => {
      if (submitting.current) return;
      try {
        localStorage.setItem(
          draftKey,
          JSON.stringify({ ...draft, doctorConfirmed: false })
        );
      } catch {
        // Storage may be blocked; the live form remains usable.
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, draftKey]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  function applyTemplate(kind: MedicalDocumentKind) {
    setDraft((current) => ({
      ...current,
      kind,
      title: MEDICAL_DOCUMENT_LABELS[kind],
      body: makeBody(kind, current.visitId, current),
      recipient: kind === "referral" ? current.recipient : "",
      validUntil: kind === "fitness" ? "" : current.validUntil || current.validFrom,
      doctorConfirmed: false,
    }));
    setResult(INITIAL_RESULT);
  }

  function discardDraft() {
    const seed: Draft = {
      kind: "sick_leave",
      visitId: firstVisit?.id ?? "",
      title: MEDICAL_DOCUMENT_LABELS.sick_leave,
      body: "",
      recipient: "",
      validFrom: today,
      validUntil: today,
      doctorConfirmed: false,
    };
    setDraft({ ...seed, body: makeBody("sick_leave", seed.visitId, seed) });
    setRestored(false);
    setResult(INITIAL_RESULT);
    try {
      localStorage.removeItem(draftKey);
    } catch {
      // Ignore unavailable local storage.
    }
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(INITIAL_RESULT);
    const formData = new FormData(event.currentTarget);
    submitting.current = true;
    startTransition(async () => {
      try {
        localStorage.removeItem(draftKey);
      } catch {
        // Ignore unavailable local storage.
      }
      try {
        const response = await createMedicalDocument(INITIAL_RESULT, formData);
        if (!response.ok) {
          submitting.current = false;
          try {
            localStorage.setItem(draftKey, JSON.stringify(draft));
          } catch {
            // Keep the live form even if a local backup cannot be written.
          }
          setResult(response);
        }
      } catch (error) {
        const digest = (error as { digest?: string })?.digest ?? "";
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) throw error;
        submitting.current = false;
        try {
          localStorage.setItem(draftKey, JSON.stringify(draft));
        } catch {
          // Keep the live form even if a local backup cannot be written.
        }
        setResult({ ok: false, message: "The document could not be issued. Check the connection and try again." });
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-5 pb-10">
      <input type="hidden" name="patientId" value={patientId} />

      {restored && (
        <div className="flex items-center gap-2 rounded-2xl bg-perisoft px-4 py-3">
          <p className="t-cap flex-1 text-peri">Restored the document you were drafting.</p>
          <button type="button" onClick={discardDraft} className="t-cap font-semibold text-peri">
            Start fresh
          </button>
        </div>
      )}

      <section>
        <h2 className="label mb-2 px-1">Document type</h2>
        <div className="grid grid-cols-2 gap-2">
          {MEDICAL_DOCUMENT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => applyTemplate(kind)}
              className={`pressable min-h-12 rounded-2xl px-3 py-2.5 text-left ${
                draft.kind === kind ? "bg-peri text-white" : "bg-surface text-ink shadow-[var(--lift)]"
              }`}
            >
              <span className="t-cap font-semibold">{MEDICAL_DOCUMENT_LABELS[kind]}</span>
            </button>
          ))}
        </div>
        <input type="hidden" name="kind" value={draft.kind} />
      </section>

      <section className="card space-y-3 p-4">
        {visits.length > 0 && (
          <label className="block">
            <span className="t-cap mb-1.5 block font-semibold text-ink2">Consult reviewed for this issue</span>
            <select
              name="visitId"
              value={draft.visitId}
              onChange={(event) => set("visitId", event.target.value)}
              className="field ring-focus w-full"
            >
              <option value="">No linked visit</option>
              {visits.map((visit) => (
                <option key={visit.id} value={visit.id}>
                  {documentDate(visit.visitDate)} · {visit.complaint || visit.diagnosis || "Visit"}
                </option>
              ))}
            </select>
          </label>
        )}

        {draft.kind === "referral" && (
          <label className="block">
            <span className="t-cap mb-1.5 block font-semibold text-ink2">To (optional)</span>
            <input
              name="recipient"
              value={draft.recipient}
              onChange={(event) => set("recipient", event.target.value)}
              maxLength={240}
              placeholder="Specialist, department or hospital"
              className="field ring-focus w-full"
            />
          </label>
        )}

        {(draft.kind === "sick_leave" || draft.kind === "fitness") && (
          <div className={`grid ${draft.kind === "sick_leave" ? "grid-cols-2" : "grid-cols-1"} gap-2`}>
            <label className="block">
              <span className="t-cap mb-1.5 block font-semibold text-ink2">
                {draft.kind === "fitness" ? "Fit from" : "Leave from"}
              </span>
              <input
                name="validFrom"
                type="date"
                required
                value={draft.validFrom}
                onInput={(event) => set("validFrom", event.currentTarget.value)}
                className="field ring-focus w-full"
              />
            </label>
            {draft.kind === "sick_leave" && (
              <label className="block">
                <span className="t-cap mb-1.5 block font-semibold text-ink2">Leave through</span>
                <input
                  name="validUntil"
                  type="date"
                  required
                  value={draft.validUntil}
                  onInput={(event) => set("validUntil", event.currentTarget.value)}
                  className="field ring-focus w-full"
                />
              </label>
            )}
          </div>
        )}

        <label className="block">
          <span className="t-cap mb-1.5 block font-semibold text-ink2">Title</span>
          <input
            name="title"
            required
            maxLength={160}
            value={draft.title}
            onChange={(event) => set("title", event.target.value)}
            className="field ring-focus w-full"
          />
        </label>
        <label className="block">
          <span className="t-cap mb-1.5 block font-semibold text-ink2">Wording to issue</span>
          <textarea
            name="body"
            required
            rows={8}
            maxLength={5000}
            value={draft.body}
            onChange={(event) => set("body", event.target.value)}
            className="field ring-focus w-full resize-y leading-relaxed"
          />
          <span className="t-micro mt-1 block text-ink3">
            The chart suggests context; the doctor remains responsible for the final wording.
          </span>
        </label>
      </section>

      <label className="card flex cursor-pointer items-start gap-3 p-4">
        <input
          name="doctorConfirmed"
          type="checkbox"
          value="yes"
          required
          checked={draft.doctorConfirmed}
          onChange={(event) => set("doctorConfirmed", event.target.checked)}
          className="mt-1 h-4 w-4 accent-[var(--peri)]"
        />
        <span className="t-cap text-ink2">
          I reviewed this wording and am issuing it under the clinic registration shown on the letterhead.
        </span>
      </label>

      {result.message && !result.ok && (
        <p role="alert" className="t-cap flex items-start gap-2 rounded-2xl bg-coralsoft p-4 text-coral">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {result.message}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary flex w-full items-center justify-center gap-2 py-3.5 disabled:opacity-60">
        <FileCheck2 size={17} /> {pending ? "Issuing…" : "Issue document"}
      </button>
    </form>
  );
}
