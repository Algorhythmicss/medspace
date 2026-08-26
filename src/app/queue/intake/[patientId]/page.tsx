import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { db } from "@/lib/db";
import { assertQueueAccess } from "@/lib/session";
import PatientHistorySubmission from "@/components/PatientHistorySubmission";

export const dynamic = "force-dynamic";

export default async function FrontDeskHistory({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  await assertQueueAccess();
  const { patientId } = await params;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const patient = await db.patient.findFirst({
    where: {
      id: patientId,
      queueEntries: { some: { status: "waiting", arrivedAt: { gte: todayStart } } },
    },
    select: { id: true, name: true, fileNumber: true },
  });
  if (!patient) notFound();

  return (
    <div className="pb-10 pt-4">
      <header className="mb-5 flex items-center gap-1">
        <Link href="/queue" aria-label="Back to queue" className="-ml-2 p-1.5 text-peri active:opacity-60">
          <ChevronLeft size={26} />
        </Link>
        <div>
          <h1 className="t-title">Add older records</h1>
          <p className="t-cap text-ink3">{patient.name} · #{patient.fileNumber}</p>
        </div>
      </header>
      <PatientHistorySubmission audience="staff" patientId={patient.id} />
      <p className="t-micro mt-4 px-4 text-center text-ink3">This submission goes to the doctor’s review queue. Front-desk staff cannot see the patient’s chart.</p>
    </div>
  );
}

