import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { db } from "../src/lib/db";
import { AssessmentError, ASSESSMENT_HOURLY_ATTEMPTS, ASSESSMENT_STORAGE_BYTES } from "../src/lib/assessment";
import { saveInitialAssessment, reserveAssessmentAttempt, recordAssessmentScan } from "../src/lib/assessment-server";
import type { PreparedAssessmentFile } from "../src/lib/assessment-uploads";
import { mergePatients } from "../src/lib/merge";

const target = new URL(process.env.DATABASE_URL || "http://missing.invalid");
assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && target.pathname === "/medspace_assessment_test", "Tests require the dedicated local medspace_assessment_test database");
const answers = { concern: "Synthetic concern only", duration: "Two days, unchanged", context: "Patient reports a medicine and an allergy; neither is a verified clinical fact." };
const patients: string[] = [];
let nextNumber = 1;
let checks = 0;

async function patient() {
  const value = await db.patient.create({ data: { fileNumber: nextNumber++, name: "Assessment security test (synthetic)" } });
  patients.push(value.id);
  return { p: value.id, v: value.linkVersion };
}

function attachment(size = 12): PreparedAssessmentFile {
  const data = new Uint8Array(size);
  return { name: "synthetic.txt", mime: "text/plain", data, size, sha256: createHash("sha256").update(data).digest("hex"), scanStatus: "quarantined", scannedAt: null };
}

async function check(label: string, test: () => Promise<unknown>) {
  await test(); checks += 1; console.log(`PASS ${label}`);
}

async function main() {
  nextNumber = ((await db.patient.aggregate({ _max: { fileNumber: true } }))._max.fileNumber || 0) + 1;
  await check("all new tables have deny-all RLS and no public grants", async () => {
    const tables = await db.$queryRaw<Array<{ relname: string; relrowsecurity: boolean; policies: bigint }>>`
      SELECT c.relname, c.relrowsecurity, (SELECT COUNT(*) FROM pg_policy p WHERE p.polrelid = c.oid) AS policies
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname IN ('InitialAssessment', 'AssessmentFile', 'AssessmentUploadLimit')
    `;
    assert.equal(tables.length, 3);
    assert(tables.every((table) => table.relrowsecurity && table.policies === BigInt(0)));
    const grants = await db.$queryRaw<Array<{ grantee: string }>>`
      SELECT grantee FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name IN ('InitialAssessment', 'AssessmentFile', 'AssessmentUploadLimit') AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    `;
    assert.equal(grants.length, 0);
  });
  await check("concurrent identical retries persist one assessment and one attachment", async () => {
    const actor = await patient(); const key = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => saveInitialAssessment(actor, key, "a".repeat(64), answers, [attachment()])));
    assert.equal(results.filter((result) => result.created).length, 1);
    assert.equal(new Set(results.map((result) => result.assessment.id)).size, 1);
    assert.equal(await db.initialAssessment.count({ where: { patientId: actor.p } }), 1);
    assert.equal(await db.assessmentFile.count({ where: { assessment: { patientId: actor.p } } }), 1);
    await assert.rejects(() => saveInitialAssessment(actor, key, "b".repeat(64), answers, []), (error: unknown) => error instanceof AssessmentError && error.status === 409);
  });
  await check("submission keys are isolated by patient", async () => {
    const first = await patient(); const second = await patient(); const key = randomUUID();
    const left = await saveInitialAssessment(first, key, "a".repeat(64), answers, []);
    const right = await saveInitialAssessment(second, key, "a".repeat(64), answers, []);
    assert.notEqual(left.assessment.id, right.assessment.id);
  });
  await check("an infected rescan wins both verdict orders and concurrent clean receipts cannot resurrect a rejected file", async () => {
    const actor = await patient();
    const result = await saveInitialAssessment(actor, randomUUID(), "a".repeat(64), answers, [attachment()]);
    const id = result.assessment.files[0].id;
    await recordAssessmentScan(id, "clean");
    await recordAssessmentScan(id, "infected");
    assert.equal((await recordAssessmentScan(id, "clean"))?.scanStatus, "rejected");
    for (let index = 0; index < 12; index += 1) {
      await db.assessmentFile.update({ where: { id }, data: { scanStatus: "quarantined", scannedAt: null } });
      await Promise.all([recordAssessmentScan(id, "clean"), recordAssessmentScan(id, "infected")]);
      assert.equal((await db.assessmentFile.findUniqueOrThrow({ where: { id }, select: { scanStatus: true } })).scanStatus, "rejected");
    }
  });
  await check("concurrent requests cannot exceed the pending/day quota", async () => {
    const actor = await patient();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => saveInitialAssessment(actor, randomUUID(), "a".repeat(64), answers, [attachment()])));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 3);
    for (const result of results) if (result.status === "rejected") assert(result.reason instanceof AssessmentError && result.reason.status === 429);
    assert.equal(await db.initialAssessment.count({ where: { patientId: actor.p } }), 3);
    assert.equal(await db.assessmentFile.count({ where: { assessment: { patientId: actor.p } } }), 3);
  });
  await check("reviewing does not bypass the rolling 24-hour submission limit", async () => {
    const actor = await patient();
    for (let index = 0; index < 3; index += 1) {
      const result = await saveInitialAssessment(actor, randomUUID(), "a".repeat(64), answers, []);
      await db.initialAssessment.update({ where: { id: result.assessment.id }, data: { status: "reviewed", reviewedAt: new Date() } });
    }
    await assert.rejects(() => saveInitialAssessment(actor, randomUUID(), "a".repeat(64), answers, []), (error: unknown) => error instanceof AssessmentError && error.code === "daily_limit");
    assert.equal(await db.condition.count({ where: { patientId: actor.p } }), 0);
    assert.equal(await db.allergy.count({ where: { patientId: actor.p } }), 0);
    assert.equal(await db.observation.count({ where: { patientId: actor.p } }), 0);
  });
  await check("revocation between upload authorization and commit prevents writes", async () => {
    const actor = await patient(); await reserveAssessmentAttempt(actor);
    await db.patient.update({ where: { id: actor.p }, data: { linkVersion: { increment: 1 } } });
    await assert.rejects(() => saveInitialAssessment(actor, randomUUID(), "a".repeat(64), answers, [attachment()]), (error: unknown) => error instanceof AssessmentError && error.status === 401);
    assert.equal(await db.initialAssessment.count({ where: { patientId: actor.p } }), 0);
  });
  await check("persistent request limits survive concurrency", async () => {
    const actor = await patient();
    const results = await Promise.allSettled(Array.from({ length: ASSESSMENT_HOURLY_ATTEMPTS + 5 }, () => reserveAssessmentAttempt(actor)));
    assert.equal(results.filter((result) => result.status === "fulfilled").length, ASSESSMENT_HOURLY_ATTEMPTS);
    for (const result of results) if (result.status === "rejected") assert(result.reason instanceof AssessmentError && result.reason.code === "rate_limit");
    assert.equal((await db.assessmentUploadLimit.findUniqueOrThrow({ where: { patientId: actor.p } })).attempts, ASSESSMENT_HOURLY_ATTEMPTS);
  });
  await check("attachment failure rolls back the assessment and every file", async () => {
    const actor = await patient(); const invalid = { ...attachment(), name: "a".repeat(141) };
    await assert.rejects(() => saveInitialAssessment(actor, randomUUID(), "a".repeat(64), answers, [attachment(), invalid]));
    assert.equal(await db.initialAssessment.count({ where: { patientId: actor.p } }), 0);
    assert.equal(await db.assessmentFile.count({ where: { assessment: { patientId: actor.p } } }), 0);
  });
  await check("lifetime attachment quota is enforced independently of review and day limits", async () => {
    const actor = await patient(); const file = attachment(2 * 1024 * 1024);
    for (let index = 0; index < ASSESSMENT_STORAGE_BYTES / (file.size * 3); index += 1) {
      await db.initialAssessment.create({ data: {
        patientId: actor.p, submissionKey: randomUUID(), payloadHash: "a".repeat(64), ...answers,
        status: "reviewed", reviewedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000),
        files: { create: [file, file, file] },
      } });
    }
    await assert.rejects(() => saveInitialAssessment(actor, randomUUID(), "a".repeat(64), answers, [attachment(1)]), (error: unknown) => error instanceof AssessmentError && error.code === "storage_limit");
    await db.initialAssessment.create({ data: { patientId: actor.p, submissionKey: randomUUID(), payloadHash: "a".repeat(64), ...answers, status: "reviewed", reviewedAt: new Date(), createdAt: new Date(Date.now() - 3 * 86_400_000), files: { create: [attachment(1)] } } });
    await saveInitialAssessment(actor, randomUUID(), "a".repeat(64), answers, []);
  });
  await check("database constraints reject oversized answers and invalid review transitions", async () => {
    const actor = await patient();
    await assert.rejects(() => db.initialAssessment.create({ data: { patientId: actor.p, submissionKey: randomUUID(), payloadHash: "a".repeat(64), ...answers, concern: "a".repeat(2001) } }));
    await assert.rejects(() => db.initialAssessment.create({ data: { patientId: actor.p, submissionKey: randomUUID(), payloadHash: "a".repeat(64), ...answers, status: "reviewed" } }));
  });
  await check("patient merges preserve assessments, attachment bytes and colliding receipt keys without resetting active upload budgets", async () => {
    const keeper = await patient(); const duplicate = await patient(); const key = randomUUID();
    const first = await saveInitialAssessment(keeper, key, "a".repeat(64), answers, [attachment()]);
    const second = await saveInitialAssessment(duplicate, key, "a".repeat(64), answers, [attachment()]);
    for (let index = 0; index < 8; index += 1) { await reserveAssessmentAttempt(keeper); await reserveAssessmentAttempt(duplicate); }
    await mergePatients(keeper.p, duplicate.p);
    assert.equal(await db.patient.count({ where: { id: duplicate.p } }), 0);
    const records = await db.initialAssessment.findMany({ where: { patientId: keeper.p }, include: { files: true } });
    assert.equal(records.length, 2); assert.equal(new Set(records.map((record) => record.submissionKey)).size, 2);
    assert.deepEqual(new Set(records.map((record) => record.id)), new Set([first.assessment.id, second.assessment.id]));
    assert(records.every((record) => record.files.length === 1 && record.files[0].data.length === 12 && record.files[0].scanStatus === "quarantined"));
    await assert.rejects(() => reserveAssessmentAttempt(keeper), (error: unknown) => error instanceof AssessmentError && error.code === "rate_limit");
    await assert.rejects(() => saveInitialAssessment(duplicate, randomUUID(), "a".repeat(64), answers, []), (error: unknown) => error instanceof AssessmentError && error.status === 401);
  });
  await check("merging waits for an in-flight upload and retains its eventual assessment instead of cascade-deleting it", async () => {
    const keeper = await patient(); const duplicate = await patient();
    const ready = Promise.withResolvers<number>(); const release = Promise.withResolvers<void>();
    const writing = db.$transaction(async (client) => {
      await client.$queryRaw`SELECT "id" FROM "Patient" WHERE "id" = ${duplicate.p} FOR UPDATE`;
      const connection = await client.$queryRaw<Array<{ pid: number }>>`SELECT pg_backend_pid() AS pid`;
      ready.resolve(connection[0].pid); await release.promise;
      return client.initialAssessment.create({ data: { patientId: duplicate.p, submissionKey: randomUUID(), payloadHash: "a".repeat(64), ...answers, files: { create: [attachment()] } } });
    }, { timeout: 5000 });
    const writingPid = await ready.promise;
    const merging = mergePatients(keeper.p, duplicate.p);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 60 && !waiting; attempt += 1) {
        const result = await db.$queryRaw<Array<{ waiting: boolean }>>`
          SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE datname = current_database()
            AND pid <> pg_backend_pid() AND state = 'active' AND wait_event_type = 'Lock'
            AND ${writingPid} = ANY(pg_blocking_pids(pid)) AND query LIKE '%"Patient"%') AS waiting
        `;
        waiting = result[0].waiting;
        if (!waiting) await delay(20);
      }
      assert(waiting, "The test must force the merge to overlap a real locked upload");
    } finally {
      release.resolve(); await Promise.all([writing, merging]);
    }
    const records = await db.initialAssessment.findMany({ where: { patientId: keeper.p }, include: { files: true } });
    assert.equal(records.length, 1); assert.equal(records[0].files.length, 1);
    assert.equal(await db.patient.count({ where: { id: duplicate.p } }), 0);
  });
  console.log(`ALL PASS: ${checks} local assessment database checks`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (patients.length) await db.patient.deleteMany({ where: { id: { in: patients } } });
  await db.$disconnect();
});
