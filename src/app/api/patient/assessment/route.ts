import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AssessmentError, assessmentAnswers } from "@/lib/assessment";
import {
  assessmentEnabled, assertAssessmentOrigin, assessmentPatient, assessmentSubmissionKey,
  reserveAssessmentAttempt, boundedAssessmentForm, assessmentPayloadHash, existingAssessment, saveInitialAssessment,
} from "@/lib/assessment-server";
import { assessmentRawFiles, prepareAssessmentFiles } from "@/lib/assessment-uploads";

export const runtime = "nodejs";
export const maxDuration = 60;

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff" };

export async function POST(request: Request) {
  if (!assessmentEnabled()) return NextResponse.json({ message: "Not found" }, { status: 404, headers: privateHeaders });
  try {
    assertAssessmentOrigin(request);
    const patient = await assessmentPatient(request);
    if (!patient) throw new AssessmentError(401, "expired", "Your care link has expired. Ask the clinic for a new one.");
    const key = assessmentSubmissionKey(request);
    await reserveAssessmentAttempt(patient);
    const form = await boundedAssessmentForm(request);
    const answers = assessmentAnswers(form);
    const rawFiles = await assessmentRawFiles(form);
    const hash = assessmentPayloadHash(answers, rawFiles);
    const existing = await existingAssessment(patient, key, hash);
    if (existing) return NextResponse.json({ ok: true, id: existing.id, files: existing.files }, { headers: privateHeaders });
    const files = await prepareAssessmentFiles(rawFiles);
    const result = await saveInitialAssessment(patient, key, hash, answers, files);
    revalidatePath(`/patients/${patient.p}`);
    revalidatePath("/plan");
    return NextResponse.json({ ok: true, id: result.assessment.id, files: result.assessment.files }, {
      status: result.created ? 201 : 200, headers: privateHeaders,
    });
  } catch (error) {
    if (error instanceof AssessmentError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, {
      status: error.status, headers: { ...privateHeaders, ...(error.status === 429 ? { "Retry-After": "3600" } : {}) },
    });
    console.error("initial assessment request failed");
    return NextResponse.json({ ok: false, message: "The clinic could not receive this assessment. Nothing is confirmed as sent; please retry or contact the clinic." }, { status: 503, headers: privateHeaders });
  }
}
