"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { downloadableAssessmentFile, type AssessmentFileSummary } from "@/lib/assessment";

export default function AssessmentFileDownload({ file, planToken, lang = "en" }: { file: AssessmentFileSummary; planToken?: string; lang?: "en" | "hi" }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  if (!downloadableAssessmentFile(file.scanStatus)) {
    return <span className="t-micro block text-ink3">{file.scanStatus === "rejected" ? (lang === "hi" ? "सुरक्षा जाँच में रोका गया" : "Blocked by safety scan") : (lang === "hi" ? "सुरक्षा जाँच बाकी है · डाउनलोड बंद है" : "Safety scan pending · download blocked")}</span>;
  }

  async function download() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/assessment-files/${file.id}`, {
        headers: planToken ? { Authorization: `Bearer ${planToken}` } : {},
        credentials: "same-origin", cache: "no-store", redirect: "error",
      });
      if (!response.ok) throw new Error("unavailable");
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError(lang === "hi" ? "अभी डाउनलोड नहीं हो सका। पेज दोबारा खोलें।" : "Download unavailable. Reopen your care plan and try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" onClick={download} disabled={pending} className="t-micro inline-flex min-h-10 items-center gap-1.5 font-semibold text-peri disabled:opacity-60">
        <Download size={14} /> {pending ? (lang === "hi" ? "डाउनलोड हो रहा है…" : "Downloading…") : (lang === "hi" ? "डाउनलोड करें" : "Download file")}
      </button>
      {error && <p role="alert" className="t-micro text-coral">{error}</p>}
    </div>
  );
}
