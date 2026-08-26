"use client";

import { useActionState, useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import Link from "next/link";
import { importPatientRoster, type RosterImportState } from "@/app/actions";

const INITIAL: RosterImportState = { ok: false, message: "" };

export default function RosterImportForm() {
  const [state, action, pending] = useActionState(importPatientRoster, INITIAL);
  const [fileName, setFileName] = useState("");

  return (
    <form action={action} className="card space-y-4 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-perisoft text-peri">
          <FileSpreadsheet size={18} />
        </span>
        <div>
          <h2 className="t-head">Patient list CSV</h2>
          <p className="t-cap mt-0.5 text-ink3">Up to 500 rows. Existing phone numbers are skipped to prevent duplicate histories.</p>
        </div>
      </div>

      {state.ok ? (
        <>
          <div className="t-cap rounded-xl bg-jadesoft px-3 py-2.5 text-jade" role="status">
            {state.message}
            {state.skipped
              ? ` ${state.skipped} row${state.skipped === 1 ? " was" : "s were"} skipped.`
              : ""}
          </div>
          {(state.added ?? 0) > 0 && (
            <Link
              href="/"
              className="t-cap flex items-center justify-center rounded-xl bg-jadesoft px-3 py-2.5 font-semibold text-jade"
            >
              Find a patient and add useful history
            </Link>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="t-cap w-full py-2 font-semibold text-peri underline decoration-peri/30 underline-offset-4"
          >
            Import another CSV
          </button>
        </>
      ) : (
        <>
          <label className="pressable flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-hairline px-4 py-4">
            <Upload size={18} className="text-peri" />
            <span className="t-body min-w-0 flex-1 truncate">{fileName || "Choose CSV file"}</span>
            <input
              name="file"
              type="file"
              aria-label="Patient list CSV"
              accept=".csv,text/csv"
              required
              onChange={(event) => setFileName(event.target.files?.[0]?.name ?? "")}
              className="sr-only"
            />
          </label>

          {state.message && (
            <div className="t-cap rounded-xl bg-coralsoft px-3 py-2.5 text-coral" role="alert">
              {state.message}
            </div>
          )}

          <button type="submit" disabled={pending} className="btn btn-primary w-full py-3.5 disabled:opacity-60">
            {pending ? "Importing…" : "Import patients"}
          </button>
        </>
      )}
    </form>
  );
}
