import Link from "next/link";
import type { Metadata } from "next";
import { Stethoscope, HeartPulse, ClipboardList, ChevronRight } from "lucide-react";
import { ArtBand } from "@/components/Art";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "medSpace",
  description: "The memory layer for your practice",
};

// The front door, for anyone arriving at the bare domain.
//
// Patients who tap their WhatsApp link never see this — they land straight on
// their care plan, which is the entire point of the link. This screen exists
// for someone who typed the address, and for the doctor or front desk each morning.
export default async function Welcome() {
  const clinic = await db.clinic.findUnique({ where: { id: "clinic" } }).catch(() => null);
  // Only offer the front-desk door if a staff passcode is actually configured.
  const hasStaff = !!process.env.MEDSPACE_STAFF_PASSCODE;

  return (
    <div className="flex min-h-dvh flex-col justify-center py-8">
      <div className="relative mb-7 overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
        <ArtBand name="consultation" height="h-[200px] lg:h-[260px]" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(70,79,150,0.92)] via-[rgba(70,79,150,0.35)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-6">
          <h1 className="t-title text-white">
            med<span className="text-[color:var(--periink2)]">Space</span>
          </h1>
          <p className="t-cap mt-1 max-w-[280px] text-periink2">
            Care that remembers. {clinic?.clinicName ?? "Your clinic"}, between every visit.
          </p>
        </div>
      </div>

      <p className="label mb-3 px-1">How would you like to continue?</p>

      <div className="space-y-3">
        <Link
          href="/login"
          className="card group flex items-center gap-4 p-5 transition-transform active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-perisoft text-peri">
            <Stethoscope size={22} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-head block">I’m the doctor</span>
            <span className="t-cap block text-ink3">
              Open the clinic with your passcode
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-ink3" />
        </Link>

        <Link
          href="/welcome/patient"
          className="card group flex items-center gap-4 p-5 transition-transform active:scale-[0.99]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-tealsoft text-teal">
            <HeartPulse size={22} strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="t-head block">I’m a patient</span>
            <span className="t-cap block text-ink3">
              See your medicines, tests and next visit
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0 text-ink3" />
        </Link>

        {hasStaff && (
          <Link
            href="/login?desk=1"
            className="card group flex items-center gap-4 p-5 transition-transform active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-buttersoft text-butter">
              <ClipboardList size={22} strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="t-head block">I’m the receptionist</span>
              <span className="t-cap block text-ink3">
                Check patients in as they arrive
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0 text-ink3" />
          </Link>
        )}
      </div>

      <p className="t-micro mt-7 px-2 text-center text-ink3">
        Patient records are private and only opened with the clinic’s passcode or
        your own personal link.
      </p>
    </div>
  );
}
