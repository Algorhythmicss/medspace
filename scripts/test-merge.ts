// Behavior test for patient merging. Creates its own synthetic pair so it never
// touches the demo panel; reseed afterwards anyway.
import "dotenv/config";
import { db } from "../src/lib/db";
import { mergePatients } from "../src/lib/merge";

function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`ok: ${label}`);
  }
}

async function main() {
  const max = await db.patient.aggregate({ _max: { fileNumber: true } });
  const base = (max._max.fileNumber ?? 100) + 1;

  // keeper: the long-standing record
  const keeper = await db.patient.create({
    data: {
      fileNumber: base,
      name: "Merge Keeper",
      phone: "9000000001",
      sex: "M",
      ageYears: 60,
      stickyNote: "Prefers Hindi.",
      conditions: { create: [{ name: "Type 2 Diabetes", status: "active" }] },
      allergies: { create: [{ substance: "Penicillin", reaction: "rash" }] },
    },
  });
  await db.visit.create({ data: { patientId: keeper.id, complaint: "keeper visit" } });

  // duplicate: created later at the front desk, some history on it already
  const dup = await db.patient.create({
    data: {
      fileNumber: base + 1,
      name: "Merge Dup",
      phone: "9000000001",
      address: "Only on the duplicate",
      stickyNote: "Comes with daughter.",
      conditions: {
        create: [
          { name: "type 2 diabetes", status: "active" }, // same problem, different case
          { name: "Hypertension", status: "active" },
        ],
      },
      allergies: { create: [{ substance: "Penicillin" }, { substance: "Sulfa drugs" }] },
    },
  });
  const dupVisit = await db.visit.create({ data: { patientId: dup.id, complaint: "dup visit" } });
  await db.observation.create({
    data: { patientId: dup.id, visitId: dupVisit.id, type: "HBA1C", value: 8.4, unit: "%", source: "lab" },
  });
  await db.report.create({ data: { patientId: dup.id, title: "Dup lab report" } });
  await db.carePlanTask.create({
    data: { patientId: dup.id, kind: "FOLLOW_UP", title: "Dup follow-up", status: "pending" },
  });
  await db.medicalDocument.create({
    data: {
      patientId: dup.id,
      visitId: dupVisit.id,
      kind: "referral",
      title: "Dup referral",
      body: "Referral content that must survive a patient-record merge.",
    },
  });

  await mergePatients(keeper.id, dup.id);

  const merged = await db.patient.findUnique({
    where: { id: keeper.id },
    include: {
      visits: true,
      observations: true,
      reports: true,
      tasks: true,
      documents: true,
      conditions: true,
      allergies: true,
    },
  });
  const dupGone = await db.patient.findUnique({ where: { id: dup.id } });

  expect(dupGone === null, "duplicate patient row is gone");
  expect(merged?.visits.length === 2, "both visits preserved on keeper");
  expect(
    Boolean(merged?.visits.some((v) => v.complaint === "dup visit")),
    "the duplicate's visit moved (nothing clinical lost)"
  );
  expect(merged?.observations.length === 1, "duplicate's observation moved");
  expect(merged?.reports.length === 1, "duplicate's report moved");
  expect(merged?.tasks.length === 1, "duplicate's pending task moved");
  expect(merged?.documents.length === 1, "duplicate's issued document moved");
  expect(merged?.conditions.length === 2, "conditions deduped case-insensitively (DM once + HTN)");
  expect(
    Boolean(merged?.conditions.some((c) => c.name === "Hypertension")),
    "condition unique to the duplicate was kept"
  );
  expect(merged?.allergies.length === 2, "allergies deduped (Penicillin once + Sulfa)");
  expect(merged?.name === "Merge Keeper", "keeper's name is not overwritten");
  expect(merged?.address === "Only on the duplicate", "blank keeper fields backfilled from duplicate");
  expect(
    merged?.stickyNote === "Prefers Hindi. · Comes with daughter.",
    "sticky notes concatenated, keeper first"
  );

  // no orphaned children left pointing at the deleted record
  const orphans =
    (await db.visit.count({ where: { patientId: dup.id } })) +
    (await db.observation.count({ where: { patientId: dup.id } })) +
    (await db.report.count({ where: { patientId: dup.id } })) +
    (await db.carePlanTask.count({ where: { patientId: dup.id } })) +
    (await db.medicalDocument.count({ where: { patientId: dup.id } }));
  expect(orphans === 0, "no rows still reference the deleted record");

  // self-merge must be refused
  let refused = false;
  try {
    await mergePatients(keeper.id, keeper.id);
  } catch {
    refused = true;
  }
  expect(refused, "merging a record into itself is refused");

  await db.patient.delete({ where: { id: keeper.id } });
  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}

main().finally(() => db.$disconnect());
