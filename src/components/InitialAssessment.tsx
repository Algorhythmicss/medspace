"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, ClipboardList, FilePlus2, ShieldCheck, X } from "lucide-react";
import {
  ASSESSMENT_ANSWER_LIMIT, ASSESSMENT_FILE_ACCEPT, ASSESSMENT_FILE_BYTES,
  ASSESSMENT_FILE_LIMIT, ASSESSMENT_QUESTIONS, ASSESSMENT_TOTAL_BYTES, type AssessmentSummary,
} from "@/lib/assessment";
import AssessmentFileDownload from "@/components/AssessmentFileDownload";

const COPY = {
  en: {
    title: "Initial assessment", subtitle: "Three questions before your visit", intro: "Tell the doctor what matters before you arrive. These are your own answers, not a diagnosis.",
    attach: "Add photos or files", limits: "Up to 3 files · 2 MB each · 3 MB total", formats: "Photos, PDF, Word, Excel, PowerPoint, OpenDocument, RTF and TXT. No executables, scripts, archives or animated images.",
    safety: "Photos are rewritten without metadata. Documents stay locked until a private malware scan passes. Nothing is sent to a public scanning service.",
    consent: "These answers and files belong to me or the person whose care plan is open, and I want this clinic to use them for care.",
    submit: "Send assessment", pending: "Checking files and sending…", sent: "Assessment received", received: "Your answers are waiting for the doctor to review. This does not confirm an appointment or that the doctor has read them.",
    another: "Send another assessment", previous: "Your recent assessments", reported: "Patient-reported", waiting: "Awaiting doctor review", reviewed: "Reviewed by doctor", dismissed: "Not used by doctor", urgent: "This form is not monitored for urgent help. If you need urgent care, contact local emergency services.",
    tooMany: "Choose up to three files, no larger than 2 MB each and 3 MB in total.", failed: "We could not confirm receipt. Your answers are still here; retry or contact the clinic.", remove: "Remove",
  },
  hi: {
    title: "शुरुआती जानकारी", subtitle: "मुलाकात से पहले तीन सवाल", intro: "क्लिनिक आने से पहले डॉक्टर को ज़रूरी जानकारी दें। ये आपके अपने जवाब हैं, निदान नहीं।",
    attach: "फोटो या फ़ाइल जोड़ें", limits: "अधिकतम 3 फ़ाइलें · हर फ़ाइल 2 MB · कुल 3 MB", formats: "फोटो, PDF, Word, Excel, PowerPoint, OpenDocument, RTF और TXT। प्रोग्राम, स्क्रिप्ट, ZIP या चलती तस्वीरें नहीं।",
    safety: "फोटो से मेटाडेटा हटाया जाता है। निजी सुरक्षा जाँच के बाद ही दस्तावेज़ डाउनलोड होंगे। कोई फ़ाइल सार्वजनिक स्कैनिंग सेवा को नहीं भेजी जाती।",
    consent: "ये जवाब और फ़ाइलें मेरी या उस व्यक्ति की हैं जिसकी देखभाल योजना खुली है, और मैं चाहता/चाहती हूँ कि क्लिनिक इन्हें इलाज के लिए उपयोग करे।",
    submit: "जानकारी भेजें", pending: "फ़ाइलें जाँचकर भेज रहे हैं…", sent: "जानकारी मिल गई", received: "डॉक्टर की जाँच के लिए जवाब मिल गए हैं। इससे अपॉइंटमेंट या डॉक्टर के पढ़ने की पुष्टि नहीं होती।",
    another: "और जानकारी भेजें", previous: "हाल में भेजी गई जानकारी", reported: "मरीज़ द्वारा दी गई जानकारी", waiting: "डॉक्टर की जाँच बाकी है", reviewed: "डॉक्टर ने समीक्षा की", dismissed: "डॉक्टर ने उपयोग नहीं किया", urgent: "यह फ़ॉर्म तत्काल सहायता के लिए नहीं देखा जाता। तुरंत इलाज की ज़रूरत हो तो स्थानीय आपातकालीन सेवा से संपर्क करें।",
    tooMany: "अधिकतम तीन फ़ाइलें चुनें। हर फ़ाइल 2 MB और कुल आकार 3 MB से अधिक न हो।", failed: "मिलने की पुष्टि नहीं हो सकी। जवाब यहीं हैं; फिर कोशिश करें या क्लिनिक से संपर्क करें।", remove: "हटाएँ",
  },
} as const;

export default function InitialAssessment({ assessments, planToken, lang = "en" }: { assessments: AssessmentSummary[]; planToken?: string; lang?: "en" | "hi" }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(assessments.length === 0);
  const [files, setFiles] = useState<File[]>([]);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submissionKey = useRef<string | null>(null);
  const t = COPY[lang];

  function addFiles(selected: FileList | null) {
    const combined = [...files, ...Array.from(selected || [])];
    if (combined.length > ASSESSMENT_FILE_LIMIT || combined.some((file) => !file.size || file.size > ASSESSMENT_FILE_BYTES) || combined.reduce((total, file) => total + file.size, 0) > ASSESSMENT_TOTAL_BYTES) {
      setError(t.tooMany);
      return;
    }
    setFiles(combined);
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = event.currentTarget;
    const body = new FormData(form);
    for (const file of files) body.append("files", file);
    submissionKey.current ||= crypto.randomUUID();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/patient/assessment", {
        method: "POST", body, credentials: "same-origin", cache: "no-store", redirect: "error",
        headers: { "Idempotency-Key": submissionKey.current, ...(planToken ? { Authorization: `Bearer ${planToken}` } : {}) },
      });
      const result = await response.json();
      if (!response.ok || result.ok !== true) {
        setError(typeof result.message === "string" ? result.message : t.failed);
        return;
      }
      form.reset();
      setFiles([]);
      setSent(true);
      router.refresh();
    } catch {
      setError(t.failed);
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="card mt-5 overflow-hidden" aria-labelledby="initial-assessment-heading">
      <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls="initial-assessment-form" className="pressable flex min-h-16 w-full items-center gap-3 p-5 text-left">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-perisoft text-peri"><ClipboardList size={22} /></span>
        <span className="min-w-0 flex-1"><span id="initial-assessment-heading" className="t-head block">{t.title}</span><span className="t-cap block text-ink3">{t.subtitle}</span></span>
        <ChevronDown size={18} className={`shrink-0 text-ink3 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>
      <div id="initial-assessment-form" hidden={!expanded}>
        {sent ? (
          <div role="status" className="mx-5 mb-5 rounded-2xl bg-jadesoft p-4 text-jade">
            <CheckCircle2 size={22} className="mb-2" /><p className="t-head">{t.sent}</p><p className="t-cap mt-1">{t.received}</p>
            <button type="button" className="t-cap mt-3 min-h-10 font-semibold underline underline-offset-4" onClick={() => { setSent(false); submissionKey.current = null; }}>{t.another}</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 border-t border-hairline p-5">
            <p className="t-cap text-ink3">{t.intro}</p>
            <fieldset disabled={pending} className="min-w-0 space-y-4 disabled:opacity-70">
              <legend className="sr-only">{t.title}</legend>
              {ASSESSMENT_QUESTIONS[lang].map((question, index) => (
                <label key={question.key} className="block">
                  <span className="t-cap mb-1.5 block font-semibold text-ink2">{index + 1}. {question.label}</span>
                  <textarea name={question.key} required maxLength={ASSESSMENT_ANSWER_LIMIT} rows={3} placeholder={question.hint} className="field ring-focus w-full resize-y" />
                </label>
              ))}
              <div className="space-y-2">
                <label className="pressable flex min-h-12 cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-hairline bg-sunk px-4 py-3 font-semibold text-peri">
                  <FilePlus2 size={18} /><span className="t-cap">{t.attach}</span>
                  <input type="file" multiple accept={ASSESSMENT_FILE_ACCEPT} aria-label={t.attach} className="sr-only" onChange={(event) => { addFiles(event.target.files); event.target.value = ""; }} />
                </label>
                <p className="t-micro text-ink3">{t.limits}</p><p className="t-micro text-ink3">{t.formats}</p>
                {files.length > 0 && <ul className="space-y-1">{files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex min-w-0 items-center gap-2 rounded-xl bg-sunk px-3 py-1">
                    <span className="t-cap min-w-0 flex-1 truncate">{file.name}</span>
                    <button type="button" className="flex h-10 w-10 shrink-0 items-center justify-center text-ink3" aria-label={`${t.remove} ${file.name}`} onClick={() => setFiles(files.filter((_, fileIndex) => fileIndex !== index))}><X size={17} /></button>
                  </li>
                ))}</ul>}
              </div>
              <label className="flex cursor-pointer items-start gap-2.5 rounded-2xl bg-sunk p-3.5">
                <input type="checkbox" name="consent" value="yes" required className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--peri)]" /><span className="t-micro text-ink2">{t.consent}</span>
              </label>
            </fieldset>
            {error && <p role="alert" className="t-cap rounded-xl bg-coralsoft px-3 py-2 text-coral">{error}</p>}
            <button type="submit" disabled={pending} className="btn btn-primary min-h-12 w-full disabled:opacity-60">{pending ? t.pending : t.submit}</button>
            <p className="t-micro flex items-start gap-1.5 text-ink3"><ShieldCheck size={14} className="mt-0.5 shrink-0" />{t.safety}</p>
            <p className="t-micro text-ink3">{t.urgent}</p>
          </form>
        )}
      </div>
      {assessments.length > 0 && (
        <details className="border-t border-hairline">
          <summary className="t-cap min-h-12 cursor-pointer px-5 py-4 font-semibold text-ink2">{t.previous} · {assessments.length}</summary>
          <div className="space-y-3 px-5 pb-5">{assessments.map((assessment) => (
            <article key={assessment.id} className="rounded-2xl border border-hairline p-3.5">
              <p className="t-micro text-ink3">{new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(new Date(assessment.createdAt))} · {t.reported}</p>
              <p className="t-cap mt-1 font-semibold text-peri">{assessment.status === "reviewed" ? t.reviewed : assessment.status === "dismissed" ? t.dismissed : t.waiting}</p>
              <dl className="mt-3 space-y-3">{ASSESSMENT_QUESTIONS[lang].map((question) => <div key={question.key}><dt className="t-micro font-semibold text-ink3">{question.label}</dt><dd className="t-cap mt-0.5 whitespace-pre-wrap break-words text-ink2">{assessment[question.key]}</dd></div>)}</dl>
              {assessment.files.length > 0 && <ul className="mt-3 space-y-2 border-t border-hairline pt-3">{assessment.files.map((file) => <li key={file.id}><p className="t-cap break-words font-semibold text-ink2">{file.name}</p><AssessmentFileDownload file={file} planToken={planToken} lang={lang} /></li>)}</ul>}
            </article>
          ))}</div>
        </details>
      )}
    </section>
  );
}
