import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { documentDate } from "@/lib/medicalDocuments";
import { patientAgeSex } from "@/lib/format";
import DocumentActions from "@/components/DocumentActions";

export const dynamic = "force-dynamic";

export default async function MedicalDocumentView({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [document, clinic] = await Promise.all([
    db.medicalDocument.findUnique({
      where: { id },
      include: { patient: true, visit: { select: { visitDate: true } } },
    }),
    db.clinic.findUnique({ where: { id: "clinic" } }),
  ]);
  if (!document) notFound();

  const validity =
    document.validFrom && document.validUntil
      ? `Valid from ${documentDate(document.validFrom)} through ${documentDate(document.validUntil)}`
      : document.validFrom
        ? `Valid from ${documentDate(document.validFrom)}`
        : null;
  const reference = `${document.patient.fileNumber}-${document.id.slice(-6).toUpperCase()}`;
  const shareText = [
    clinic?.clinicName,
    document.title,
    document.recipient ? `To: ${document.recipient}` : null,
    `Patient: ${document.patient.name} · Ref ${reference}`,
    "",
    document.body,
    validity ? `\n${validity}` : null,
    `\nIssued ${documentDate(document.issuedAt)}`,
    clinic?.doctorName,
    clinic?.regNumber ? `Reg. No: ${clinic.regNumber}` : null,
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");

  return (
    <div className="mx-auto w-full max-w-[720px] pt-4 print:px-0 print:pt-0">
      <header className="mb-3 flex items-center justify-between print:hidden">
        <Link href={`/patients/${document.patientId}`} className="text-peri active:opacity-60">
          ‹ Chart
        </Link>
        <span className="t-cap text-ink3">Issued document</span>
      </header>

      <article className="min-h-[760px] rounded-2xl bg-white p-6 shadow-[var(--lift)] print:min-h-0 print:rounded-none print:p-0 print:shadow-none">
        <header className="border-b-2 border-slate-700 pb-4 text-center">
          <h1 className="text-xl font-bold">{clinic?.clinicName}</h1>
          <p className="mt-1 text-sm font-medium">{clinic?.doctorName}</p>
          {clinic?.degrees && <p className="text-xs text-slate-500">{clinic.degrees}</p>}
          <p className="text-xs text-slate-500">
            {clinic?.regNumber ? `Reg. No: ${clinic.regNumber}` : ""}
            {clinic?.phone ? ` · ${clinic.phone}` : ""}
          </p>
          {clinic?.address && <p className="text-xs text-slate-500">{clinic.address}</p>}
        </header>

        <div className="mt-4 flex justify-between gap-4 text-xs text-slate-500">
          <span>Ref: {reference}</span>
          <span>{documentDate(document.issuedAt)}</span>
        </div>
        <h2 className="mt-7 text-center text-lg font-bold uppercase tracking-wide underline underline-offset-4">
          {document.title}
        </h2>

        {document.recipient && (
          <p className="mt-7 text-sm">
            <span className="font-semibold">To:</span> {document.recipient}
          </p>
        )}

        <div className="mt-6 text-sm leading-7">
          <p>
            <span className="font-semibold">Patient:</span> {document.patient.name}{" "}
            <span className="text-slate-500">
              ({patientAgeSex(document.patient)}) · File #{document.patient.fileNumber}
            </span>
          </p>
          <p className="mt-5 whitespace-pre-line">{document.body}</p>
          {validity && <p className="mt-5 font-semibold">{validity}</p>}
        </div>

        <footer className="mt-20 flex justify-end">
          <div className="min-w-44 text-center text-xs text-slate-500">
            <div className="h-10" />
            <p className="font-semibold text-slate-700">{clinic?.doctorName}</p>
            <p>Reg. No: {clinic?.regNumber}</p>
          </div>
        </footer>
        <p className="mt-12 border-t border-slate-200 pt-3 text-center text-[10px] text-slate-400">
          Issued from the clinic record. Corrections are made by issuing a new document.
        </p>
      </article>

      <DocumentActions
        patientPhone={document.patient.phone}
        documentText={shareText}
        patientId={document.patientId}
      />
    </div>
  );
}
