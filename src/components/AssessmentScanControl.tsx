"use client";

import { useActionState } from "react";
import { rescanAssessmentFile } from "@/app/assessment-actions";

export default function AssessmentScanControl({ fileId }: { fileId: string }) {
  const [state, action, pending] = useActionState(rescanAssessmentFile, { message: "" });
  return (
    <form action={action} className="mt-1">
      <input type="hidden" name="fileId" value={fileId} />
      <button disabled={pending} className="t-micro min-h-10 font-semibold text-peri disabled:opacity-60">{pending ? "Running private safety scan…" : "Retry private safety scan"}</button>
      {state.message && <p role="status" className="t-micro text-ink3">{state.message}</p>}
    </form>
  );
}
