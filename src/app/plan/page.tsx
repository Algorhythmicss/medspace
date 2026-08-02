import type { Metadata } from "next";
import { redirect } from "next/navigation";
import PlanView, { loadPlanData } from "@/components/PlanView";
import { readPatientSession } from "@/lib/session";
import { toPlanLang } from "@/lib/planText";

export const dynamic = "force-dynamic";

// The returning patient's view — same plan, reached by a Google sign-in instead
// of a link. Authed by the medspace_patient cookie, so nothing signed appears
// in the URL. Deliberately does NOT count toward planOpenCount (that metric
// means "the WhatsApp link was opened"); only /p/<token> records opens.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Your care plan",
};

export default async function SignedInPlan({
  searchParams,
}: {
  searchParams: Promise<{ lang?: string }>;
}) {
  const { lang: langParam } = await searchParams;
  const session = await readPatientSession();
  if (!session) redirect("/welcome/patient");

  const { patient, clinic } = await loadPlanData(session.p);
  // A reset (bumped linkVersion) invalidates the session too — send them back
  // to sign in, which will only succeed if their binding is still active.
  if (!patient || session.v !== patient.linkVersion) redirect("/welcome/patient");

  const lang = toPlanLang(langParam ?? patient.language);
  return <PlanView patient={patient} clinic={clinic} signedIn lang={lang} />;
}
