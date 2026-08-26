import { Check, FileText, X } from "lucide-react";
import { reviewPatientHistory } from "@/app/actions";
import { shortDate } from "@/lib/format";

export type PendingHistory = {
  id: string;
  title: string;
  reportDate: Date;
  source: string;
  summary: string | null;
  fileName: string | null;
};

export default function HistoryReview({ submissions }: { submissions: PendingHistory[] }) {
  if (submissions.length === 0) return null;

  return (
    <section className="pt-1">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 className="label">Needs review · {submissions.length}</h2>
        <span className="t-micro text-ink3">Not in chart yet</span>
      </div>
      <div className="space-y-2.5">
        {submissions.map((submission) => (
          <article key={submission.id} className="card overflow-hidden">
            <div className="p-4">
              <div className="min-w-0">
                <p className="t-micro mb-1 flex items-center gap-1.5 text-butter">
                  <span className="h-2 w-2 rounded-full bg-butter" /> Awaiting review
                </p>
                <p className="t-head truncate">{submission.title}</p>
                <p className="t-micro text-ink3">
                  {submission.source === "staff" ? "Added at front desk" : "Patient submitted"} · {shortDate(submission.reportDate)}
                </p>
              </div>
              {submission.summary && (
                <p className="t-cap mt-3 whitespace-pre-line border-l-2 border-hairline pl-3 text-ink2">
                  {submission.summary}
                </p>
              )}
              {submission.fileName && (
                <a
                  href={`/api/reports/${submission.id}/file`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="t-cap mt-3 inline-flex items-center gap-1.5 font-semibold text-peri active:opacity-60"
                >
                  <FileText size={14} /> Open {submission.fileName}
                </a>
              )}
            </div>
            <div className="grid grid-cols-2 border-t border-hairline">
              <form action={reviewPatientHistory}>
                <input type="hidden" name="reportId" value={submission.id} />
                <input type="hidden" name="decision" value="dismiss" />
                <button type="submit" className="t-cap flex w-full items-center justify-center gap-1.5 py-3.5 font-semibold text-ink3 active:bg-sunk">
                  <X size={14} /> Dismiss
                </button>
              </form>
              <form action={reviewPatientHistory} className="border-l border-hairline">
                <input type="hidden" name="reportId" value={submission.id} />
                <input type="hidden" name="decision" value="accept" />
                <button type="submit" className="t-cap flex w-full items-center justify-center gap-1.5 py-3.5 font-semibold text-jade active:bg-jadesoft">
                  <Check size={15} /> Add to chart
                </button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
