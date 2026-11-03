import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { queueTicketSnapshot } from "@/lib/queue-ticket";
import { liveClinicEnabled } from "@/lib/live-clinic-server";
import LivePatient from "@/components/live/LivePatient";
export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your queue ticket",
  robots: { index: false, follow: false, nocache: true },
};
export default async function QueueTicketPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  if (!liveClinicEnabled()) notFound();
  const { token } = await params;
  try {
    await queueTicketSnapshot(token);
  } catch {
    notFound();
  }
  return (
    <div className="pb-8">
      <header className="py-4">
        <p className="label">MedSpace</p>
        <h1 className="t-title mt-2">Your queue ticket</h1>
        <p className="t-cap mt-2 text-ink3">
          Keep this link private. Reception can help if your place looks wrong.
        </p>
      </header>
      <LivePatient
        key={token}
        patientId="ticket"
        planToken={token}
        ticketOnly
      />
      <p className="t-cap mt-4 text-ink3">
        This ticket shows your queue position only. After the consultation, the
        doctor shares your private care plan separately.
      </p>
    </div>
  );
}
