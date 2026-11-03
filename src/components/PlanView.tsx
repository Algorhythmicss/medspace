import {
  Pill,
  FlaskConical,
  CalendarCheck,
  FileText,
  Phone,
  MessageCircle,
  ChevronDown,
} from "lucide-react";
import { db } from "@/lib/db";
import { plainFrequency, plainInstruction } from "@/lib/dosage";
import { relDay, shortDate } from "@/lib/format";
import { waLink, telLink } from "@/lib/phone";
import { PLAN_TEXT, planDuration, type PlanLang } from "@/lib/planText";
import { ArtBand, ArtSpot } from "@/components/Art";
import ContinueWithGoogle from "@/components/ContinueWithGoogle";
import PatientSignOut from "@/components/PatientSignOut";
import PlanReply from "@/components/PlanReply";
import LogHomeReading from "@/components/LogHomeReading";
import PlanLangToggle from "@/components/PlanLangToggle";
import PatientHistorySubmission from "@/components/PatientHistorySubmission";
import InitialAssessment from "@/components/InitialAssessment";
import { assessmentEnabled, assessmentSelection } from "@/lib/assessment-server";
import {liveClinicEnabled} from "@/lib/live-clinic-server";
import LivePatient from "@/components/live/LivePatient";

// The patient's plan, rendered identically whether they arrived by tapping
// their WhatsApp link (/p/<token>) or by signing in with Google (/plan). The
// only differences are the footer: a not-yet-linked link-visitor is offered
// "sign in so you don't need the link next time"; a signed-in visitor gets
// "not you? sign out" for the shared-family-phone case. Everything the patient
// reads is language-aware — drug names stay, the plain-language around them
// (timings, instructions, headings) switches.

export async function loadPlanData(patientId: string) {
  const [patient, clinic, assessments] = await Promise.all([
    db.patient.findUnique({
      where: { id: patientId },
      include: {
        tasks: { where: { status: "pending" }, orderBy: { dueDate: "asc" } },
        // A follow-up visit often carries no new prescription — the patient
        // simply continues what they're on. Look back a few visits so "your
        // medicines" reflects the active prescription, not a blank because the
        // last visit didn't re-issue one.
        visits: {
          orderBy: { visitDate: "desc" },
          take: 5,
          include: {
            prescription: { include: { items: { orderBy: { sortOrder: "asc" } } } },
          },
        },
        reports: {
          where: { reviewStatus: "verified" },
          orderBy: { reportDate: "desc" },
          take: 4,
          select: { id: true, title: true, reportDate: true, summary: true },
        },
        _count: {
          select: { reports: { where: { reviewStatus: "pending" } } },
        },
      },
    }),
    db.clinic.findUnique({ where: { id: "clinic" } }),
    assessmentEnabled() ? db.initialAssessment.findMany({ where: { patientId }, orderBy: { createdAt: "desc" }, take: 5, select: assessmentSelection }) : Promise.resolve([]),
  ]);
  return { patient, clinic, assessments };
}

type PlanData = Awaited<ReturnType<typeof loadPlanData>>;

export default async function PlanView({
  patient,
  clinic,
  signedIn,
  planToken,
  lang = "en",
  assessments = [],
}: {
  patient: NonNullable<PlanData["patient"]>;
  clinic: PlanData["clinic"];
  signedIn: boolean;
  planToken?: string;
  lang?: PlanLang;
  assessments?: PlanData["assessments"];
}) {
  const t = PLAN_TEXT[lang];
  const firstName = patient.name.split(" ")[0];
  const doctor = clinic?.doctorName ?? "";
  // The active prescription is the most recent one on record — not necessarily
  // the last visit, which may have been a lab-review with nothing re-issued.
  const rxVisit = patient.visits.find(
    (v) => v.prescription && (v.prescription.items.length > 0 || v.prescription.advice)
  );
  const meds = rxVisit?.prescription?.items ?? [];
  const advice = rxVisit?.prescription?.advice ?? null;
  const followUp = patient.tasks.find((t) => t.kind === "FOLLOW_UP");
  const tests = patient.tasks.filter((t) => t.kind === "LAB_TEST");
  const now = new Date();

  const waHref = waLink(clinic?.phone);
  const telHref = telLink(clinic?.phone);

  // Offer Google only to a link-visitor who hasn't linked yet.
  const offerGoogle =
    !signedIn && (await db.patientAccess.count({ where: { patientId: patient.id } })) === 0;

  return (
    <div className="pb-16">
      {/* ── welcome ─────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
        <ArtBand name="consultation" height="h-[190px] lg:h-[230px]" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(70,79,150,0.9)] via-[rgba(70,79,150,0.5)] to-transparent" />
        <div className="absolute right-3 top-3">
          <PlanLangToggle lang={lang} />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="t-cap text-periink2">{clinic?.clinicName}</p>
          <h1 className="t-title text-white">{t.hello(firstName)}</h1>
          <p className="t-cap mt-1 text-periink2">{t.careFrom(doctor)}</p>
        </div>
      </header>

      {signedIn && <PatientSignOut />}
      {liveClinicEnabled() ? <LivePatient key={patient.id} patientId={patient.id} planToken={planToken} /> : null}
      {assessmentEnabled() && <InitialAssessment assessments={assessments.map((assessment) => ({ ...assessment, createdAt: assessment.createdAt.toISOString() }))} planToken={planToken} lang={lang} />}

      <section className="mt-5">
        {patient._count.reports > 0 && (
          <p className="t-cap mb-2 flex items-center gap-2 px-1 text-butter">
            <span className="h-2 w-2 shrink-0 rounded-full bg-butter" />
            {lang === "hi"
              ? `${patient._count.reports} रिकॉर्ड डॉक्टर की जाँच का इंतज़ार कर ${patient._count.reports === 1 ? "रहा" : "रहे"} है।`
              : `${patient._count.reports} record${patient._count.reports === 1 ? " is" : "s are"} waiting for the doctor to review.`}
          </p>
        )}
        {patient.visits.length === 0 && !assessmentEnabled() ? (
          <PatientHistorySubmission planToken={planToken} lang={lang} />
        ) : (
          <details className="group/plan-history">
            <summary className="card pressable flex min-h-12 cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <FileText size={17} className="shrink-0 text-peri" />
              <span className="t-body flex-1">
                {lang === "hi" ? "पुरानी पर्ची या रिपोर्ट भेजें" : "Share an older prescription or report"}
              </span>
              <ChevronDown size={17} className="shrink-0 text-ink3 transition-transform group-open/plan-history:rotate-180" />
            </summary>
            <div className="mt-2">
              <PatientHistorySubmission planToken={planToken} lang={lang} embedded />
            </div>
          </details>
        )}
      </section>

      {/* ── the next appointment ─────────────────────────────── */}
      {followUp?.dueDate && (
        <section className="mt-5">
          <div className="card flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-perisoft text-peri">
              <CalendarCheck size={22} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="t-head">{followUp.dueDate < now ? t.visitDue : t.nextVisit}</p>
              <p className="t-body text-ink2">
                {shortDate(followUp.dueDate)}
                {followUp.dueDate < now && (
                  <span className="text-coral"> · {relDay(followUp.dueDate)}</span>
                )}
              </p>
            </div>
          </div>
          <PlanReply planToken={planToken} initial={patient.planReplyKind} lang={lang} />
        </section>
      )}

      {/* ── medicines ───────────────────────────────────────── */}
      {meds.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Pill size={16} className="text-peri" />
            <h2 className="t-head">{t.medicines}</h2>
          </div>
          <div className="card rows overflow-hidden">
            {meds.map((m) => (
              <div key={m.id} className="px-5 py-4">
                <p className="t-bodyL">{m.drugName}</p>
                <p className="t-cap mt-0.5 text-ink2">
                  {plainFrequency(m.frequency, lang)}
                  {m.duration ? ` · ${t.forDuration(planDuration(m.duration, lang))}` : ""}
                </p>
                {plainInstruction(m.instructions, lang) && (
                  <p className="t-cap mt-0.5 text-ink3">{plainInstruction(m.instructions, lang)}</p>
                )}
              </div>
            ))}
          </div>
          {advice && <p className="t-cap mt-2 px-1 text-ink2">{advice}</p>}
        </section>
      )}

      {/* advice with no medicines (e.g. "rest, plenty of fluids") — still shown */}
      {meds.length === 0 && advice && (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Pill size={16} className="text-peri" />
            <h2 className="t-head">{t.fromDoctor}</h2>
          </div>
          <p className="card px-5 py-4 t-body text-ink2">{advice}</p>
        </section>
      )}

      {/* ── tests still to do ───────────────────────────────── */}
      {tests.length > 0 && (
        <section className="mt-6">
          <div className="relative mb-3 overflow-hidden rounded-[22px] shadow-[var(--lift)]">
            <ArtBand name="lab" height="h-[112px]" small />
            <div className="absolute inset-0 bg-gradient-to-r from-[rgba(70,79,150,0.86)] to-[rgba(70,79,150,0.25)]" />
            <div className="absolute inset-0 flex items-center px-5">
              <div>
                <p className="t-head text-white">{t.testsTitle}</p>
                <p className="t-cap text-periink2">{t.testsSub}</p>
              </div>
            </div>
          </div>
          <div className="card rows overflow-hidden">
            {tests.map((task) => (
              <div key={task.id} className="flex items-center gap-3 px-5 py-3.5">
                <FlaskConical size={15} className="shrink-0 text-peri" />
                <span className="t-body min-w-0 flex-1">{task.title}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── reports we already have ─────────────────────────── */}
      {patient.reports.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2 px-1">
            <FileText size={16} className="text-peri" />
            <h2 className="t-head">{t.reports}</h2>
          </div>
          <div className="card rows overflow-hidden">
            {patient.reports.map((r) => (
              <div key={r.id} className="px-5 py-3.5">
                <p className="t-body">{r.title}</p>
                <p className="t-micro text-ink3">{shortDate(r.reportDate)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── log a home reading ──────────────────────────────── */}
      <LogHomeReading planToken={planToken} lang={lang} />

      {/* Nothing outstanding — the calm case deserves a picture too. */}
      {meds.length === 0 && tests.length === 0 && !followUp && !advice && (
        <section className="mt-8 text-center">
          <ArtSpot name="room" className="mb-5" />
          <p className="t-head">{t.nothingTitle}</p>
          <p className="t-cap mx-auto mt-1 max-w-[280px] text-ink3">{t.nothingSub(doctor)}</p>
        </section>
      )}

      {/* ── sign in with Google so the link isn't needed next time ─── */}
      {offerGoogle && (
        <section className="mt-8">
          <div className="card p-5">
            <p className="t-head">{t.signInTitle}</p>
            <p className="t-body mt-1 text-ink2">{t.signInBody}</p>
            <div className="mt-4">
              <ContinueWithGoogle planToken={planToken} lang={lang} />
            </div>
          </div>
        </section>
      )}

      {/* ── reaching the clinic ─────────────────────────────── */}
      <section className="mt-8">
        <div className="relative overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
          <ArtBand name="reception" height="h-[150px]" small />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(70,79,150,0.92)] to-[rgba(70,79,150,0.3)]" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="t-head text-white">{t.questions}</p>
            <p className="t-cap text-periink2">{clinic?.clinicName}</p>
            <div className="mt-3 flex gap-2">
              {waHref && (
                <a
                  href={waHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn inline-flex items-center gap-1.5 bg-white/95 px-4 py-2 text-[14px] text-[color:var(--peri-2)]"
                >
                  <MessageCircle size={15} strokeWidth={2.2} /> WhatsApp
                </a>
              )}
              {telHref && (
                <a
                  href={telHref}
                  className="btn inline-flex items-center gap-1.5 bg-white/20 px-4 py-2 text-[14px] text-white backdrop-blur-sm"
                >
                  <Phone size={15} strokeWidth={2.2} /> {t.call}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <p className="t-micro mt-6 px-2 text-center text-ink3">
        {!signedIn && `${t.privateNote} `}
        {lang === "hi"
          ? "जानकारी गलत हो या पहुँच बंद करवानी हो तो क्लिनिक से संपर्क करें।"
          : "If anything is wrong or you want access revoked, contact the clinic."}
      </p>
    </div>
  );
}
