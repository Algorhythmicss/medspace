import Link from "next/link";
import type { Metadata } from "next";
import { ChevronLeft, MessageCircle, Phone } from "lucide-react";
import { ArtBand } from "@/components/Art";
import OpenMyPlan from "@/components/OpenMyPlan";
import ContinueWithGoogle from "@/components/ContinueWithGoogle";
import { db } from "@/lib/db";
import { waLink, telLink } from "@/lib/phone";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Open your care plan",
  robots: { index: false, follow: false },
};

export default async function PatientEntry({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const { e } = await searchParams;
  const clinic = await db.clinic.findUnique({ where: { id: "clinic" } }).catch(() => null);
  const waHref = waLink(clinic?.phone);
  const telHref = telLink(clinic?.phone);

  return (
    <div className="py-6">
      <Link
        href="/welcome"
        className="-ml-2 mb-4 inline-flex items-center gap-1 rounded-full p-2 text-ink3 transition-opacity active:opacity-60"
      >
        <ChevronLeft size={20} />
        <span className="t-cap">Back</span>
      </Link>

      <div className="relative mb-6 overflow-hidden rounded-[26px] shadow-[var(--lift-lg)]">
        <ArtBand name="discharge" height="h-[186px]" priority />
        <div className="absolute inset-0 bg-gradient-to-t from-[rgba(70,79,150,0.92)] via-[rgba(70,79,150,0.4)] to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-5">
          <h1 className="t-title text-white">Your care plan</h1>
          <p className="t-cap mt-1 text-periink2">
            Medicines, tests and your next visit — always up to date
          </p>
        </div>
      </div>

      {/* Deliberately neutral: never reveal whether a Google account belongs to
          a patient here — for a specialist clinic, "you're a patient" is itself
          sensitive. Same message whether or not the account is linked. */}
      {e === "nolink" && (
        <div className="card mb-4 border border-[color:var(--butter)]/30 p-4">
          <p className="t-body text-ink2">
            If your clinic has linked this account, your plan will open. Otherwise,
            open the link from WhatsApp, or ask the clinic to send it.
          </p>
        </div>
      )}

      {/* Returning patients lead — one tap and they're back in. */}
      <div className="card p-5">
        <p className="t-head">Been here before?</p>
        <p className="t-body mt-1 text-ink2">
          Sign in with the Google account you linked, and your plan opens on its own.
        </p>
        <div className="mt-4">
          <ContinueWithGoogle />
        </div>
      </div>

      {/* First visit / has the link. */}
      <div className="card mt-4 p-5">
        <p className="t-head">{clinic?.clinicName ?? "Your clinic"} sends you a private link</p>
        <p className="t-body mt-1.5 text-ink2">
          After each visit it arrives on WhatsApp. Tap it and your plan opens —
          nothing to install. You can link Google from there so you won’t need
          the link next time.
        </p>

        <div className="mt-4">
          <p className="label mb-1.5">Already have the link?</p>
          <OpenMyPlan />
        </div>
      </div>

      {(waHref || telHref) && (
        <div className="card mt-4 p-5">
          <p className="t-head">Can’t find your link?</p>
          <p className="t-body mt-1 text-ink2">
            Message the clinic and they’ll send it again.
          </p>
          <div className="mt-3 flex gap-2">
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="btn inline-flex items-center gap-1.5 bg-jade px-4 py-2.5 text-[14px] text-white"
              >
                <MessageCircle size={15} strokeWidth={2.2} /> WhatsApp
              </a>
            )}
            {telHref && (
              <a
                href={telHref}
                className="btn inline-flex items-center gap-1.5 bg-sunk px-4 py-2.5 text-[14px] text-ink"
              >
                <Phone size={15} strokeWidth={2.2} /> Call
              </a>
            )}
          </div>
        </div>
      )}

      <p className="t-micro mt-6 px-2 text-center text-ink3">
        Your records are private, opened only with your link or your linked
        Google account.
      </p>
    </div>
  );
}
