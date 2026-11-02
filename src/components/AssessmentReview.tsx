import { reviewInitialAssessment } from "@/app/assessment-actions";
import { ASSESSMENT_QUESTIONS, downloadableAssessmentFile, type AssessmentSummary } from "@/lib/assessment";
import { shortDate } from "@/lib/format";
import AssessmentScanControl from "@/components/AssessmentScanControl";

export default function AssessmentReview({ assessments }: { assessments: AssessmentSummary[] }) {
  if (!assessments.length) return null;
  return (
    <section id="assessment-review" className="scroll-mt-20 pt-1" aria-labelledby="assessment-review-heading">
      <h2 id="assessment-review-heading" className="label mb-2 px-1">Patient assessments</h2>
      <div className="space-y-2.5">{assessments.map((assessment) => (
        <details key={assessment.id} className="card overflow-hidden" open={assessment.status === "pending"}>
          <summary className="cursor-pointer p-4"><span className="t-head">Initial assessment</span><span className="t-micro mt-1 block text-ink3">Patient-reported · {shortDate(new Date(assessment.createdAt))} · {assessment.status === "pending" ? "Awaiting review" : assessment.status === "reviewed" ? "Reviewed" : "Dismissed"}</span></summary>
          <div className="space-y-4 border-t border-hairline p-4">
            <p className="t-micro text-ink3">Review with the patient. These answers are not a diagnosis and are never automatically added as verified medicines, allergies or conditions.</p>
            <dl className="space-y-3">{ASSESSMENT_QUESTIONS.en.map((question) => <div key={question.key}><dt className="t-cap font-semibold text-ink2">{question.label}</dt><dd className="t-cap mt-1 whitespace-pre-wrap break-words border-l-2 border-hairline pl-3 text-ink2">{assessment[question.key]}</dd></div>)}</dl>
            {assessment.files.length > 0 && <ul className="space-y-2 border-t border-hairline pt-3">{assessment.files.map((file) => <li key={file.id} className="rounded-xl bg-sunk p-3"><p className="t-cap break-words font-semibold text-ink2">{file.name}</p>{downloadableAssessmentFile(file.scanStatus) ? <a href={`/api/assessment-files/${file.id}`} className="t-cap inline-flex min-h-10 items-center font-semibold text-peri">Download attachment</a> : <p className="t-micro mt-1 text-ink3">{file.scanStatus === "rejected" ? "Failed safety scan · download blocked" : "Quarantined · download blocked until a private malware scan passes"}</p>}{file.scanStatus === "quarantined" && <AssessmentScanControl fileId={file.id} />}</li>)}</ul>}
          </div>
          {assessment.status === "pending" && <div className="grid grid-cols-2 border-t border-hairline">{(["dismissed", "reviewed"] as const).map((decision) => <form key={decision} action={reviewInitialAssessment} className={decision === "reviewed" ? "border-l border-hairline" : ""}><input type="hidden" name="assessmentId" value={assessment.id} /><input type="hidden" name="decision" value={decision} /><button className={`t-cap min-h-12 w-full px-3 py-3 font-semibold ${decision === "reviewed" ? "text-jade" : "text-ink3"}`}>{decision === "reviewed" ? "Mark reviewed" : "Dismiss"}</button></form>)}</div>}
        </details>
      ))}</div>
    </section>
  );
}
