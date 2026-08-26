"use client";

import { useActionState, useState } from "react";
import { CheckCircle2, FileUp, ShieldCheck } from "lucide-react";
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
    body: "Add only what you already know. The doctor reviews it before it becomes part of the chart.",
    conditions: "Known conditions (diabetes, BP, thyroid…)",
    medicines: "Medicines currently being taken",
    allergies: "Medicine allergies",
    note: "Anything else the doctor should know",
    titleField: "Record name (optional)",
    date: "Date on the record",
    recordType: "Record type",
    prescription: "Prescription",
    labReport: "Lab report",
    imaging: "Scan / imaging",
    other: "Other record",
    choose: "Attach photo or PDF",
    submit: "Send for doctor review",
    pending: "Sending securely…",
    trust: "Nothing is added as verified history until the doctor accepts it.",
    received: "Record received",
    receivedBody: "Sent to the clinic for the doctor to review.",
    another: "Send another record",
  },
  hi: {
    eyebrow: "अगली मुलाकात की तैयारी",
    title: "पुरानी पर्ची या रिपोर्ट भेजें",
    body: "जो जानकारी आपके पास है वही भरें। डॉक्टर की जाँच के बाद ही यह रिकॉर्ड में जुड़ेगी।",
    conditions: "पुरानी बीमारी (शुगर, बीपी, थायरॉइड…)",
    medicines: "अभी चल रही दवाइयाँ",
    allergies: "दवा से एलर्जी",
    note: "डॉक्टर को और क्या पता होना चाहिए",
    titleField: "रिकॉर्ड का नाम (वैकल्पिक)",
    date: "रिकॉर्ड की तारीख",
    recordType: "रिकॉर्ड का प्रकार",
    prescription: "पुरानी पर्ची",
    labReport: "लैब रिपोर्ट",
    imaging: "स्कैन / इमेजिंग",
    other: "अन्य रिकॉर्ड",
    choose: "फोटो या PDF लगाएँ",
    submit: "डॉक्टर की जाँच के लिए भेजें",
    pending: "सुरक्षित रूप से भेज रहे हैं…",
    trust: "डॉक्टर की स्वीकृति तक कोई जानकारी सत्यापित रिकॉर्ड नहीं बनेगी।",
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
}: {
  audience?: "patient" | "staff";
  planToken?: string;
  patientId?: string;
  lang?: "en" | "hi";
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

      <div>
        <p className="t-micro font-semibold uppercase tracking-[0.08em] text-peri">
          {audience === "staff" ? "Front-desk intake" : t.eyebrow}
        </p>
        <h2 className="t-head mt-1">{t.title}</h2>
        <p className="t-cap mt-1 text-ink3">{t.body}</p>
      </div>

      <textarea name="conditions" aria-label={t.conditions} rows={2} placeholder={t.conditions} className="field ring-focus w-full resize-y" />
      <textarea name="medications" aria-label={t.medicines} rows={2} placeholder={t.medicines} className="field ring-focus w-full resize-y" />
      <textarea name="allergies" aria-label={t.allergies} rows={2} placeholder={t.allergies} className="field ring-focus w-full resize-y" />
      <textarea name="note" aria-label={t.note} rows={2} placeholder={t.note} className="field ring-focus w-full resize-y" />

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

      <label className="pressable flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-hairline px-4 py-3 text-ink2">
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

      {state.message && !state.ok && (
        <p role="alert" className="t-cap rounded-xl bg-coralsoft px-3 py-2 text-coral">
          {state.message}
        </p>
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
