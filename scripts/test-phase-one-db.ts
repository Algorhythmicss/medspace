// Database invariants for Phase 1 documents and reusable prescriptions. Run
// only against the local Docker database after migrations; all rows are cleaned.
import "dotenv/config";
import { db } from "../src/lib/db";

function expect(condition: boolean, label: string) {
  if (!condition) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

async function main() {
  const suffix = `${Date.now()}`;
  const max = await db.patient.aggregate({ _max: { fileNumber: true } });
  const patient = await db.patient.create({
    data: {
      fileNumber: (max._max.fileNumber ?? 100) + 1,
      name: "Phase One Test Patient",
    },
  });
  let setId: string | null = null;

  try {
    const visit = await db.visit.create({
      data: { patientId: patient.id, complaint: "Document workflow test" },
    });
    const savedSet = await db.prescriptionSet.create({
      data: {
        name: `Phase one ${suffix}`,
        nameKey: `phase one ${suffix}`,
        followUpInDays: 14,
        labTasks: ["CBC"],
        items: {
          create: [{ sortOrder: 0, drugName: "Test medicine", frequency: "OD" }],
        },
      },
      include: { items: true },
    });
    setId = savedSet.id;
    expect(savedSet.items.length === 1, "saved prescription owns its ordered medicines");
    expect(savedSet.labTasks[0] === "CBC", "saved prescription keeps investigations");

    const duplicateRejected = await db.prescriptionSet
      .create({ data: { name: "Different case", nameKey: savedSet.nameKey } })
      .then(() => false)
      .catch((error: { code?: string }) => error.code === "P2002");
    expect(duplicateRejected, "case-normalized saved-set name is unique");

    const document = await db.medicalDocument.create({
      data: {
        patientId: patient.id,
        visitId: visit.id,
        kind: "referral",
        title: "Referral letter",
        body: "Please assess this patient for the documented concern.",
      },
    });
    expect(document.visitId === visit.id, "issued document is anchored to the reviewed visit");

    await db.visit.delete({ where: { id: visit.id } });
    const afterVisitDelete = await db.medicalDocument.findUnique({ where: { id: document.id } });
    expect(afterVisitDelete?.visitId === null, "document survives visit removal with its audit content intact");

    await db.patient.delete({ where: { id: patient.id } });
    expect(
      (await db.medicalDocument.count({ where: { id: document.id } })) === 0,
      "patient deletion cascades to their sensitive documents"
    );
  } finally {
    await db.patient.deleteMany({ where: { id: patient.id } }).catch(() => {});
    if (setId) await db.prescriptionSet.deleteMany({ where: { id: setId } }).catch(() => {});
    await db.prescriptionSet.deleteMany({ where: { nameKey: `phase one ${suffix}` } }).catch(() => {});
  }

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}

main().finally(() => db.$disconnect());
