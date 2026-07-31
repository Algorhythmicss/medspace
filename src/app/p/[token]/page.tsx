import type { Metadata } from "next";
import { after } from "next/server";
import { notFound } from "next/navigation";
import {
  Pill,
  FlaskConical,
  CalendarCheck,
  FileText,
  Phone,
  MessageCircle,
} from "lucide-react";
import { db } from "@/lib/db";
import { readPatientToken } from "@/lib/patientLink";
import { plainFrequency, plainInstruction } from "@/lib/dosage";
import { relDay, shortDate } from "@/lib/format";
import { waLink, telLink } from "@/lib/phone";
import { ArtBand, ArtSpot } from "@/components/Art";

export const dynamic = "force-dynamic";

// A link that opens medical records must never reach a search index.
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
  title: "Your care plan",
};

export default async function PatientView({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const patientId = await readPatientToken(token);
  if (!patientId) notFound();

  const [patient, clinic] = await Promise.all([
    db.patient.findUnique({
      where: { id: patientId },
      include: {
        tasks: { where: { status: "pending" }, orderBy: { dueDate: "asc" } },
        visits: {
          orderBy: { visitDate: "desc" },
          take: 1,
          include: { prescription: { include: { items: { orderBy: { sortOrder: "asc" } } } } },
        },
        reports: {
          orderBy: { reportDate: "desc" },
          take: 4,
          select: { id: true, title: true, reportDate: true, summary: true },
        },
      },
    }),
    db.clinic.findUnique({ where: { id: "clinic" } }),
  ]);
  if (!patient) notFound();

  // Record the open. This is the pilot's core metric: the research is blunt
  // that engagement, not messaging, is the binding constraint — the doctor
  // needs to see who actually looked, not just who was sent something.
  //
  // `after()` runs once the response is flushed, so the patient never waits on
  // a tracking write, but unlike a bare floating promise it is actually
  // guaranteed to run.
  const firstOpen = patient.planFirstOpenedAt;
  after(async () => {
    try {
      await db.patient.update({
        where: { id: patient.id },
        data: {
          planFirstOpenedAt: firstOpen ?? new Date(),
          planLastOpenedAt: new Date(),
          planOpenCount: { increment: 1 },
        },
      });
    } catch (err) {
      // never swallow silently — a metric that fails quietly is worse than none
      console.error("failed to record plan open", err);
    }
  });

  const firstName = patient.name.split(" ")[0];
  const lastVisit = patient.visits[0];
  const meds = lastVisit?.prescription?.items ?? [];
  const followUp = patient.tasks.find((t) => t.kind === "FOLLOW_UP");
  const tests = patient.tasks.filter((t) => t.kind === "LAB_TEST");
  const now = new Date();

  const waHref = waLink(clinic?.phone);
  const telHref = telLink(clinic?.phone);

  return (
    <div className="pb-16">
      {/* ── welcome ─────────────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
        <ArtBand name="consultation" height="h-[190px] lg:h-[230px]" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(70,79,150,0.9)] via-[rgba(70,79,150,0.5)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <p className="t-cap text-periink2">{clinic?.clinicName}</p>
          <h1 className="t-title text-white">Hello, {firstName}</h1>
          <p className="t-cap mt-1 text-periink2">
            Your care plan from {clinic?.doctorName}
          </p>
        </div>
      </header>

      {/* ── the next appointment ─────────────────────────────── */}
      {followUp?.dueDate && (
        <section className="mt-5">
          <div className="card flex items-center gap-4 p-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-perisoft text-peri">
              <CalendarCheck size={22} strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <p className="t-head">
                {followUp.dueDate < now ? "Your visit is due" : "Your next visit"}
              </p>
              <p className="t-body text-ink2">
                {shortDate(followUp.dueDate)}
                {followUp.dueDate < now && (
                  <span className="text-coral"> · {relDay(followUp.dueDate)}</span>
                )}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* ── medicines ───────────────────────────────────────── */}
      {meds.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Pill size={16} className="text-peri" />
            <h2 className="t-head">Your medicines</h2>
          </div>
          <div className="card rows overflow-hidden">
            {meds.map((m) => (
              <div key={m.id} className="px-5 py-4">
                <p className="t-bodyL">{m.drugName}</p>
                <p className="t-cap mt-0.5 text-ink2">
                  {plainFrequency(m.frequency)}
                  {m.duration ? ` · for ${m.duration}` : ""}
                </p>
                {plainInstruction(m.instructions) && (
                  <p className="t-cap mt-0.5 text-ink3">{plainInstruction(m.instructions)}</p>
                )}
              </div>
            ))}
          </div>
          {lastVisit?.prescription?.advice && (
            <p className="t-cap mt-2 px-1 text-ink2">{lastVisit.prescription.advice}</p>
          )}
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
                <p className="t-head text-white">Tests to get done</p>
                <p className="t-cap text-periink2">Please bring the reports to your visit</p>
              </div>
            </div>
          </div>
          <div className="card rows overflow-hidden">
            {tests.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-5 py-3.5">
                <FlaskConical size={15} className="shrink-0 text-peri" />
                <span className="t-body min-w-0 flex-1">{t.title}</span>
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
            <h2 className="t-head">Reports on file</h2>
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

      {/* Nothing outstanding — the calm case deserves a picture too. */}
      {meds.length === 0 && tests.length === 0 && !followUp && (
        <section className="mt-8 text-center">
          <ArtSpot name="room" className="mb-5" />
          <p className="t-head">Nothing pending right now</p>
          <p className="t-cap mx-auto mt-1 max-w-[280px] text-ink3">
            When {clinic?.doctorName ?? "your doctor"} adds medicines, tests or a
            next visit, they will appear here.
          </p>
        </section>
      )}

      {/* ── reaching the clinic ─────────────────────────────── */}
      <section className="mt-8">
        <div className="relative overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
          <ArtBand name="reception" height="h-[150px]" small />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(70,79,150,0.92)] to-[rgba(70,79,150,0.3)]" />
          <div className="absolute inset-x-0 bottom-0 p-5">
            <p className="t-head text-white">Questions about your care?</p>
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
                  <Phone size={15} strokeWidth={2.2} /> Call
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <p className="t-micro mt-6 px-2 text-center text-ink3">
        This page is private to you. Please don’t forward the link.
      </p>
    </div>
  );
}
