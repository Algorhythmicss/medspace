// Behavior test for lab-task supersedure. Uses an isolated synthetic patient.
import "dotenv/config";
import { db } from "../src/lib/db";
import { supersedeStaleLabTasks } from "../src/lib/tasks";

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
      name: "Supersede Test Patient",
    },
  });

  try {
    const stale = await db.carePlanTask.create({
      data: {
        patientId: patient.id,
        kind: "LAB_TEST",
        title: "Lipid profile + KFT",
        status: "pending",
        dueDate: new Date(Date.now() - 20 * 86400000),
      },
    });
    const unrelated = await db.carePlanTask.create({
      data: {
        patientId: patient.id,
        kind: "LAB_TEST",
        title: "TSH",
        status: "pending",
        dueDate: new Date(Date.now() - 10 * 86400000),
      },
    });

    const cancelled = await supersedeStaleLabTasks(
      patient.id,
      ["Lipid profile"],
      "fake-visit-id"
    );
    const staleAfter = await db.carePlanTask.findUnique({ where: { id: stale.id } });
    const unrelatedAfter = await db.carePlanTask.findUnique({ where: { id: unrelated.id } });

    expect(cancelled >= 1, "at least the stale combined order was superseded");
    expect(staleAfter?.status === "cancelled", "overlapping combined order is cancelled");
    expect(unrelatedAfter?.status === "pending", "unrelated TSH stays pending");

    const before = await db.carePlanTask.count({
      where: { patientId: patient.id, status: "pending", kind: "LAB_TEST" },
    });
    await supersedeStaleLabTasks(patient.id, ["Repeat test"], "fake-visit-id");
    const after = await db.carePlanTask.count({
      where: { patientId: patient.id, status: "pending", kind: "LAB_TEST" },
    });
    expect(before === after, "stopword-only order supersedes nothing");
  } finally {
    await db.patient.delete({ where: { id: patient.id } }).catch(() => {});
  }

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}

main().finally(() => db.$disconnect());
