// Behavior test for report saving + memory integration. Run against dev db;
// reseed afterwards.
import "dotenv/config";
import { db } from "../src/lib/db";
import { saveReport } from "../src/lib/reports";
import { buildMemoryCard } from "../src/lib/memory";

function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${label}`);
  }
}

async function main() {
  const sunita = await db.patient.findUnique({ where: { fileNumber: 102 } });
  if (!sunita) throw new Error("seed patient missing — reseed first");

  const report = await saveReport({
    patientId: sunita.id,
    title: "Test TSH panel",
    kind: "lab",
    reportDate: new Date(),
    summary: "test",
    values: [{ type: "TSH", value: 2.1 }],
    file: { name: "test.pdf", mime: "application/pdf", bytes: new Uint8Array(Buffer.from("%PDF-1.4 test")) },
  });

  expect(report.fileName === "test.pdf", "attachment filename stored");
  expect(report.fileMime === "application/pdf", "attachment mime stored");
  const stored = await db.report.findUnique({
    where: { id: report.id },
    select: { fileData: true },
  });
  expect(
    Boolean(stored?.fileData && Buffer.from(stored.fileData).toString().startsWith("%PDF")),
    "attachment bytes round-trip through the database"
  );

  const obs = await db.observation.findFirst({
    where: { patientId: sunita.id, type: "TSH", value: 2.1 },
  });
  expect(obs?.source === "lab" && obs?.unit === "mIU/L", "observation created with lab source + unit");

  const card = await buildMemoryCard(sunita.id);
  expect(
    Boolean(card?.lines.some((l) => l.kind === "trend" && l.text.startsWith("TSH"))),
    "memory card trends pick up the new lab value"
  );
  expect(
    Boolean(card?.lines.some((l) => l.kind === "report" && l.text.includes("Test TSH panel"))),
    "memory card flags report newer than last visit"
  );

  const tshTask = await db.carePlanTask.findFirst({
    where: { patientId: sunita.id, title: { contains: "TSH" } },
  });
  expect(
    tshTask?.status === "done" && tshTask?.completedAt != null,
    "pending TSH lab order auto-completed by arriving TSH value"
  );

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}

main().finally(() => db.$disconnect());
