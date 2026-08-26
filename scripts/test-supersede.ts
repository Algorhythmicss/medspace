// Behavior test for lab-task supersedure, run against the dev db (reseed after).
import "dotenv/config";
import { db } from "../src/lib/db";

import { supersedeStaleLabTasks } from "../src/lib/tasks";

async function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${label}`);
  }
}

async function main() {
  const ramesh = await db.patient.findUnique({ where: { fileNumber: 101 } });
  if (!ramesh) throw new Error("seed patient missing — reseed first");

  // fixture: one stale combined order, one unrelated pending lab
  const stale = await db.carePlanTask.create({
    data: { patientId: ramesh.id, kind: "LAB_TEST", title: "Lipid profile + KFT", status: "pending", dueDate: new Date(Date.now() - 20 * 86400000) },
  });
  const unrelated = await db.carePlanTask.create({
    data: { patientId: ramesh.id, kind: "LAB_TEST", title: "TSH", status: "pending", dueDate: new Date(Date.now() - 10 * 86400000) },
  });

  const cancelled = await supersedeStaleLabTasks(ramesh.id, ["Lipid profile"], "fake-visit-id");

  const staleAfter = await db.carePlanTask.findUnique({ where: { id: stale.id } });
  const unrelatedAfter = await db.carePlanTask.findUnique({ where: { id: unrelated.id } });

  await expect(cancelled >= 1, "at least the stale combined order was superseded");
  await expect(staleAfter?.status === "cancelled", "overlapping 'Lipid profile + KFT' → cancelled");
  await expect(unrelatedAfter?.status === "pending", "unrelated 'TSH' stays pending");

  // generic-word guard: ordering "Repeat test" must not cancel anything by
  // stopword overlap alone
  const before = await db.carePlanTask.count({ where: { patientId: ramesh.id, status: "pending", kind: "LAB_TEST" } });
  await supersedeStaleLabTasks(ramesh.id, ["Repeat test"], "fake-visit-id");
  const after = await db.carePlanTask.count({ where: { patientId: ramesh.id, status: "pending", kind: "LAB_TEST" } });
  await expect(before === after, "stopword-only order supersedes nothing");

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}

main().finally(() => db.$disconnect());
