import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { shortDate, patientAgeSex } from "@/lib/format";
import RxActions from "@/components/RxActions";

export const dynamic = "force-dynamic";

export default async function RxView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [visit, clinic] = await Promise.all([
    db.visit.findUnique({
      where: { id },
      include: {
        patient: true,
        prescription: { include: { items: { orderBy: { sortOrder: "asc" } } } },
        observations: true,
        tasks: true,
      },
    }),
    db.clinic.findUnique({ where: { id: "clinic" } }),
  ]);
  if (!visit) notFound();

  // QR on every prescription — scanning it at the next visit opens the chart
  // (the "barcode" that solves instant patient lookup).
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  const scanUrl = `${proto}://${host}/scan/${visit.patient.fileNumber}`;
  const qrDataUrl = await QRCode.toDataURL(scanUrl, { margin: 1, width: 160 });

  const bpSys = visit.observations.find((o) => o.type === "BP_SYS")?.value;
  const bpDia = visit.observations.find((o) => o.type === "BP_DIA")?.value;
  const weight = visit.observations.find((o) => o.type === "WEIGHT")?.value;
  const labTasks = visit.tasks.filter((t) => t.kind === "LAB_TEST");

  // Plain-text version for WhatsApp share
  const rxLines = [
    `${clinic?.clinicName ?? ""} — ${clinic?.doctorName ?? ""}`,
    `${visit.patient.name} (${patientAgeSex(visit.patient)}) · ${shortDate(visit.visitDate)}`,
    visit.diagnosis ? `Dx: ${visit.diagnosis}` : null,
    "",
    ...(visit.prescription?.items.map(
      (i, idx) =>
        `${idx + 1}. ${i.drugName} — ${i.frequency}${i.duration ? ` × ${i.duration}` : ""}${
          i.instructions ? ` (${i.instructions})` : ""
        }`
    ) ?? []),
    visit.prescription?.advice ? `\nAdvice: ${visit.prescription.advice}` : null,
    labTasks.length > 0 ? `\nTests: ${labTasks.map((t) => t.title).join(", ")}` : null,
    visit.followUpDate ? `\nNext visit: ${shortDate(visit.followUpDate)}` : null,
  ]
    .filter((line) => line !== null)
    .join("\n");

  return (
    <div className="px-4 pt-4 print:px-0 print:pt-0">
      <header className="mb-3 flex items-center justify-between print:hidden">
        <Link
          href={`/patients/${visit.patientId}`}
          className="-ml-1 flex items-center text-[17px] text-accent active:opacity-60"
        >
          ‹ Chart
        </Link>
        <span className="text-[13px] text-label2">Prescription</span>
      </header>

      {/* printable sheet — deliberately classic paper styling, not app chrome */}
      <div className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)] print:rounded-none print:p-0 print:shadow-none">
        <div className="flex items-start justify-between border-b border-slate-300 pb-3">
          <div>
            <h1 className="text-lg font-bold">{clinic?.clinicName}</h1>
            <p className="text-sm">
              {clinic?.doctorName} <span className="text-slate-500">{clinic?.degrees}</span>
            </p>
            <p className="text-xs text-slate-500">
              Reg. No: {clinic?.regNumber}
              {clinic?.phone ? ` · ${clinic.phone}` : ""}
            </p>
            {clinic?.address && <p className="text-xs text-slate-500">{clinic.address}</p>}
          </div>
          <div className="shrink-0 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt={`Scan to open patient #${visit.patient.fileNumber}`} className="h-[72px] w-[72px]" />
            <p className="mt-0.5 text-[10px] text-slate-500">#{visit.patient.fileNumber} · scan at visit</p>
          </div>
        </div>

        <div className="flex justify-between border-b border-slate-200 py-2 text-sm">
          <span>
            <strong>{visit.patient.name}</strong>{" "}
            <span className="text-slate-500">
              {patientAgeSex(visit.patient)} · #{visit.patient.fileNumber}
            </span>
          </span>
          <span className="text-slate-500">{shortDate(visit.visitDate)}</span>
        </div>

        {(visit.complaint || visit.diagnosis || bpSys || weight) && (
          <div className="border-b border-slate-200 py-2 text-xs text-slate-600">
            {visit.complaint && <p>C/O: {visit.complaint}</p>}
            {visit.diagnosis && <p className="font-medium">Dx: {visit.diagnosis}</p>}
            {(bpSys || weight) && (
              <p>
                {bpSys ? `BP ${bpSys}/${bpDia ?? "?"} mmHg` : ""}
                {bpSys && weight ? " · " : ""}
                {weight ? `Wt ${weight} kg` : ""}
              </p>
            )}
          </div>
        )}

        <div className="py-3">
          <p className="mb-2 text-lg font-serif italic">℞</p>
          <ol className="space-y-2">
            {visit.prescription?.items.map((item, idx) => (
              <li key={item.id} className="text-sm">
                <span className="font-medium">
                  {idx + 1}. {item.drugName}
                </span>
                <span className="ml-2 text-slate-600">
                  {item.frequency}
                  {item.duration ? ` × ${item.duration}` : ""}
                </span>
                {item.instructions && (
                  <span className="ml-1 text-xs text-slate-500">({item.instructions})</span>
                )}
              </li>
            ))}
          </ol>
          {visit.prescription?.advice && (
            <p className="mt-3 text-xs text-slate-600">
              <strong>Advice:</strong> {visit.prescription.advice}
            </p>
          )}
          {labTasks.length > 0 && (
            <p className="mt-2 text-xs text-slate-600">
              <strong>Investigations:</strong> {labTasks.map((t) => t.title).join(", ")}
            </p>
          )}
          {visit.followUpDate && (
            <p className="mt-2 text-sm font-medium">
              Next visit: {shortDate(visit.followUpDate)}
            </p>
          )}
        </div>

        <div className="flex justify-end border-t border-slate-200 pt-6">
          <div className="text-center text-xs text-slate-500">
            <div className="mb-1 h-8" />
            <p>{clinic?.doctorName}</p>
            <p>Reg. No: {clinic?.regNumber}</p>
          </div>
        </div>
      </div>

      <RxActions patientPhone={visit.patient.phone} rxText={rxLines} patientId={visit.patientId} />
    </div>
  );
}
