import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { readPatientLink } from "@/lib/patientLink";
import PlanView, { loadPlanData } from "@/components/PlanView";

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
  const link = await readPatientLink(token);
  if (!link) notFound();

  const { patient, clinic } = await loadPlanData(link.p);
  // Reject a token minted before the doctor reset this patient's links, even
  // though its signature and expiry are still valid — this is the revocation.
  if (!patient || link.v !== patient.linkVersion) notFound();

  // Record the open — the pilot's core metric. Skip link-preview crawlers
  // (WhatsApp dereferences every link it sends, before the patient looks) and
  // non-navigation fetches, so the count means real opens.
  const h = await headers();
  const ua = h.get("user-agent") ?? "";
  const mode = h.get("sec-fetch-mode");
  const isCrawler =
    /bot|crawler|spider|preview|facebookexternalhit|WhatsApp|Twitterbot|Slackbot|TelegramBot|LinkedInBot|Embedly|Google-InspectionTool|bingbot/i.test(
      ua
    );
  if (!isCrawler && (mode == null || mode === "navigate")) {
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
        console.error("failed to record plan open", err);
      }
    });
  }

  return <PlanView patient={patient} clinic={clinic} signedIn={false} planToken={token} />;
}
