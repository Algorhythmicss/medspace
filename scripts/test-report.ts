// Behavior test for report saving + memory integration. Creates and removes a
// synthetic patient, so it is safe against any local clinic dataset.
import "dotenv/config";
import { db } from "../src/lib/db";
import { saveReport } from "../src/lib/reports";
import { buildMemoryCard } from "../src/lib/memory";

function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

async function main() {
  const max = await db.patient.aggregate({ _max: { fileNumber: true } });
  const patient = await db.patient.create({
    data: {
      fileNumber: (max._max.fileNumber ?? 100) + 1,
      name: "Report Test Patient",
      conditions: { create: { name: "Hypothyroidism", status: "active" } },
      visits: { create: { visitDate: new Date(Date.now() - 86400000), complaint: "Review" } },
      observations: {
        create: {
          type: "TSH",
          value: 8.2,
          unit: "mIU/L",
          measuredAt: new Date(Date.now() - 30 * 86400000),
          source: "lab",
        },
      },
      tasks: { create: { kind: "LAB_TEST", title: "Repeat TSH", status: "pending" } },
    },
  });

  try {
    const report = await saveReport({
      patientId: patient.id,
      title: "Test TSH panel",
      kind: "lab",
      reportDate: new Date(),
      summary: "test",
      values: [{ type: "TSH", value: 2.1 }],
      file: {
        name: "test.pdf",
        mime: "application/pdf",
        bytes: new Uint8Array(Buffer.from("%PDF-1.4 test")),
      },
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

    const observation = await db.observation.findFirst({
      where: { patientId: patient.id, type: "TSH", value: 2.1 },
    });
    expect(
      observation?.source === "lab" && observation?.unit === "mIU/L",
      "observation created with lab source + unit"
    );

    const card = await buildMemoryCard(patient.id);
    expect(
      Boolean(card?.lines.some((line) => line.kind === "trend" && line.text.startsWith("TSH"))),
      "memory card trends pick up the new lab value"
    );
    expect(
      Boolean(
        card?.lines.some(
          (line) => line.kind === "report" && line.text.includes("Test TSH panel")
        )
      ),
      "memory card flags report newer than last visit"
    );

    const tshTask = await db.carePlanTask.findFirst({
      where: { patientId: patient.id, title: { contains: "TSH" } },
    });
    expect(
      tshTask?.status === "done" && tshTask.completedAt != null,
      "pending TSH lab order auto-completed by arriving TSH value"
    );
  } finally {
    await db.patient.delete({ where: { id: patient.id } }).catch(() => {});
  }

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}

main().finally(() => db.$disconnect());
