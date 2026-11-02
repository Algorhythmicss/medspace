import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { createPatientToken } from "../src/lib/patientLink";

const target = new URL(process.env.DATABASE_URL || "http://missing.invalid");
const base = new URL(process.env.MEDSPACE_ASSESSMENT_TEST_URL || "http://127.0.0.1:3004");
assert(["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) && target.pathname === "/medspace_assessment_test");
assert(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname));
let patientId: string | undefined;

async function main() {
  const max = (await db.patient.aggregate({ _max: { fileNumber: true } }))._max.fileNumber || 0;
  const patient = await db.patient.create({ data: { name: "SYNTHETIC antivirus HTTP control", fileNumber: max + 1 } });
  patientId = patient.id;
  const token = await createPatientToken(patient.id);
  function form() {
    const input = new FormData(); input.set("concern", "SYNTHETIC scanner check"); input.set("duration", "Not applicable"); input.set("context", "Not clinical information"); input.set("consent", "yes"); return input;
  }
  async function post(input: FormData) {
    return fetch(new URL("/api/patient/assessment", base), { method: "POST", body: input, headers: { Origin: base.origin, Authorization: `Bearer ${token}`, "Idempotency-Key": randomUUID() } });
  }
  const clean = form(); clean.append("files", new File(["A clean synthetic document"], "clean.txt", { type: "text/plain" }));
  const accepted = await post(clean); assert.equal(accepted.status, 201, JSON.stringify(await accepted.clone().json()));
  const receipt = await accepted.json(); assert.equal(receipt.files[0].scanStatus, "clean");
  const downloaded = await fetch(new URL(`/api/assessment-files/${receipt.files[0].id}`, base), { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(downloaded.status, 200); assert.equal(await downloaded.text(), "A clean synthetic document");
  console.log("PASS real private ClamAV unlocks a clean document through the packaged HTTP flow");
  const infected = form();
  const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).png().toBuffer();
  infected.append("files", new File([new Uint8Array(photo)], "safe-photo.png", { type: "image/png" }));
  infected.append("files", new File(["X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"], "eicar-control.txt", { type: "text/plain" }));
  const rejected = await post(infected); assert.equal(rejected.status, 422); assert.equal((await rejected.json()).code, "malware");
  assert.equal(await db.initialAssessment.count({ where: { patientId: patient.id } }), 1);
  assert.equal(await db.assessmentFile.count({ where: { assessment: { patientId: patient.id } } }), 1);
  console.log("PASS actual EICAR detection rejects the entire submission without storing its clean photo or answers");
  console.log("ALL PASS: 2 packaged private-antivirus integration checks");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (patientId) await db.patient.delete({ where: { id: patientId } });
  await db.$disconnect();
});
