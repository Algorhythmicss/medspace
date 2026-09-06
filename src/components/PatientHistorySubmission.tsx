"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, ChevronDown, FileUp, ShieldCheck } from "lucide-react";
import {
  submitPatientHistory,
  submitStaffHistory,
  type HistorySubmissionState,
} from "@/app/actions";

const INITIAL: HistorySubmissionState = { ok: false, message: "" };

const COPY = {
  en: {
    eyebrow: "Prepare the next visit",
    title: "Share an older prescription or report",
    body: "Share what matters now. The doctor reviews it before it enters the chart.",
    conditions: "Known conditions",
    conditionsHint: "Diabetes, BP, thyroid…",
    medicines: "Current medicines",
    medicinesHint: "Name, strength, and how often",
    allergies: "Medicine allergies",
    allergiesHint: "Leave blank if none are known",
    note: "Anything else the doctor should know",
    titleField: "Record name (optional)",
    date: "Date on the record",
    recordType: "Record type",
    prescription: "Prescription",
    labReport: "Lab report",
    imaging: "Scan / imaging",
    other: "Other record",
    choose: "Attach photo or PDF",
    details: "Record details",
    optional: "Optional",
    submit: "Send for doctor review",
    pending: "Sending securely…",
    trust: "Nothing is added as verified history until the doctor accepts it.",
    consent: "This record belongs to me or the person whose care plan is open, and I want this clinic to use it for care.",
    received: "Record received",
    receivedBody: "Sent to the clinic for the doctor to review.",
    another: "Send another record",
  },
  hi: {
    eyebrow: "अगली मुलाकात की तैयारी",
    title: "पुरानी पर्ची या रिपोर्ट भेजें",
    body: "अभी काम की जानकारी साझा करें। डॉक्टर की जाँच के बाद ही यह रिकॉर्ड में जुड़ेगी।",
    conditions: "पुरानी बीमारी",
    conditionsHint: "शुगर, बीपी, थायरॉइड…",
    medicines: "अभी चल रही दवाइयाँ",
    medicinesHint: "नाम, मात्रा और कितनी बार",
    allergies: "दवा से एलर्जी",
    allergiesHint: "पता न हो तो खाली छोड़ें",
    note: "डॉक्टर को और क्या पता होना चाहिए",
    titleField: "रिकॉर्ड का नाम (वैकल्पिक)",
    date: "रिकॉर्ड की तारीख",
    recordType: "रिकॉर्ड का प्रकार",
    prescription: "पुरानी पर्ची",
    labReport: "लैब रिपोर्ट",
    imaging: "स्कैन / इमेजिंग",
    other: "अन्य रिकॉर्ड",
    choose: "फोटो या PDF लगाएँ",
    details: "रिकॉर्ड की जानकारी",
    optional: "वैकल्पिक",
    submit: "डॉक्टर की जाँच के लिए भेजें",
    pending: "सुरक्षित रूप से भेज रहे हैं…",
    trust: "डॉक्टर की स्वीकृति तक कोई जानकारी सत्यापित रिकॉर्ड नहीं बनेगी।",
    consent: "यह रिकॉर्ड मेरा या उस व्यक्ति का है जिसकी देखभाल योजना खुली है, और मैं चाहता/चाहती हूँ कि क्लिनिक इसे इलाज के लिए उपयोग करे।",
    received: "रिकॉर्ड मिल गया",
    receivedBody: "डॉक्टर की जाँच के लिए क्लिनिक को भेज दिया गया है।",
    another: "एक और रिकॉर्ड भेजें",
  },
} as const;

export default function PatientHistorySubmission({
  audience = "patient",
  planToken,
  patientId,
  lang = "en",
  embedded = false,
}: {
  audience?: "patient" | "staff";
  planToken?: string;
  patientId?: string;
  lang?: "en" | "hi";
  embedded?: boolean;
}) {
  const action = audience === "staff" ? submitStaffHistory : submitPatientHistory;
  const [state, formAction, pending] = useActionState(action, INITIAL);
  const [fileName, setFileName] = useState("");
  const t = COPY[lang];

  if (state.ok) {
    return (
      <div className="card flex items-start gap-3 bg-jadesoft p-5 text-jade">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
        <div>
          <p className="t-head">{t.received}</p>
          <p className="t-cap mt-0.5">{t.receivedBody}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="t-cap mt-3 font-semibold text-jade underline decoration-jade/30 underline-offset-4"
          >
            {t.another}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-3 p-5">
      {planToken && <input type="hidden" name="planToken" value={planToken} />}
      {patientId && <input type="hidden" name="patientId" value={patientId} />}
      <input type="hidden" name="language" value={lang} />

      {!embedded && (
        <div>
          <p className="t-micro font-semibold text-peri">
            {audience === "staff" ? "Front-desk intake" : t.eyebrow}
          </p>
          <h2 className="t-head mt-1">{t.title}</h2>
          <p className="t-cap mt-1 text-ink3">{t.body}</p>
        </div>
      )}

      <label className="block">
        <span className="t-cap mb-1.5 block font-semibold text-ink2">{t.conditions}</span>
        <textarea name="conditions" rows={2} placeholder={t.conditionsHint} className="field ring-focus w-full resize-y" />
      </label>
      <label className="block">
        <span className="t-cap mb-1.5 block font-semibold text-ink2">{t.medicines}</span>
        <textarea name="medications" rows={2} placeholder={t.medicinesHint} className="field ring-focus w-full resize-y" />
      </label>
      <label className="block">
        <span className="t-cap mb-1.5 block font-semibold text-ink2">{t.allergies}</span>
        <textarea name="allergies" rows={2} placeholder={t.allergiesHint} className="field ring-focus w-full resize-y" />
      </label>

      <label className="pressable flex min-h-12 cursor-pointer items-center gap-3 rounded-2xl border border-hairline bg-sunk px-4 py-3 text-ink2">
        <FileUp size={18} className="shrink-0 text-peri" />
        <span className="t-cap min-w-0 flex-1 truncate">{fileName || `${t.choose} · max 4MB`}</span>
        <input
          name="file"
          type="file"
          aria-label={t.choose}
          accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
          onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
          className="sr-only"
        />
      </label>

      <details className="group/record-details rounded-2xl border border-hairline">
        <summary className="pressable flex min-h-12 cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
          <span className="t-cap flex-1 font-semibold text-ink2">{t.details}</span>
          <span className="t-micro text-ink3">{t.optional}</span>
          <ChevronDown size={16} className="shrink-0 text-ink3 transition-transform group-open/record-details:rotate-180" />
        </summary>
        <div className="space-y-2 border-t border-hairline p-3">
          <div className="grid grid-cols-2 gap-2">
            <select name="kind" aria-label={t.recordType} defaultValue="outside_rx" className="field ring-focus w-full">
              <option value="outside_rx">{t.prescription}</option>
              <option value="lab">{t.labReport}</option>
              <option value="imaging">{t.imaging}</option>
              <option value="other">{t.other}</option>
            </select>
            <input name="reportDate" type="date" aria-label={t.date} className="field ring-focus w-full" />
          </div>
          <input name="title" aria-label={t.titleField} placeholder={t.titleField} className="field ring-focus w-full" />
          <textarea name="note" aria-label={t.note} rows={2} placeholder={t.note} className="field ring-focus w-full resize-y" />
        </div>
      </details>

      {state.message && !state.ok && (
        <p role="alert" className="t-cap rounded-xl bg-coralsoft px-3 py-2 text-coral">
          {state.message}
        </p>
      )}

      {audience === "patient" && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl bg-sunk px-3.5 py-3">
          <input
            name="consent"
            type="checkbox"
            value="yes"
            required
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--peri)]"
          />
          <span className="t-micro text-ink2">{t.consent}</span>
        </label>
      )}

      <button type="submit" disabled={pending} className="btn btn-primary w-full py-3.5 disabled:opacity-60">
        {pending ? t.pending : t.submit}
      </button>
      <p className="t-micro flex items-start gap-1.5 text-ink3">
        <ShieldCheck size={13} className="mt-0.5 shrink-0" /> {t.trust}
      </p>
    </form>
  );
}
