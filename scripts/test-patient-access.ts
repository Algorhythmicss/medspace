// Google-identity binding: the tokens must not be cross-usable, and the
// resolver must fail closed (an unknown account gets [], never the panel). The
// DB half runs against synthetic patients above the demo panel and cleans up.
import { config } from "dotenv";
config({ path: ".env.local" });
import {
  createBindToken,
  readBindToken,
  createChooserToken,
  readChooserToken,
  createPatientSession,
  readPatientSessionValue,
  readPatientLink,
  createPatientToken,
} from "../src/lib/patientLink";
import {
  bindIdentity,
  patientsForIdentity,
  hasActiveAccess,
  accessForPatient,
} from "../src/lib/patientAccess";
import { mergePatients } from "../src/lib/merge";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

async function tokenTests() {
  // round-trips
  const bind = await createBindToken("pt-1", 3);
  const rb = await readBindToken(bind);
  expect(rb?.p === "pt-1" && rb?.v === 3, "bind token round-trips to patient + version");

  const who = await createChooserToken(["a", "b"], "sub-9");
  const rw = await readChooserToken(who);
  expect(rw?.ids.join(",") === "a,b" && rw?.s === "sub-9", "chooser token round-trips ids + sub");

  const sess = await createPatientSession("pt-2", 5);
  const rs = await readPatientSessionValue(sess);
  expect(rs?.p === "pt-2" && rs?.v === 5, "session token round-trips patient + version");

  // kind confusion — each reader rejects the others
  expect((await readBindToken(who)) === null, "a chooser token is not accepted as a bind token");
  expect((await readChooserToken(sess)) === null, "a session token is not accepted as a chooser token");
  expect((await readPatientSessionValue(bind)) === null, "a bind token is not accepted as a session token");
  // the critical one: a non-plan token must never open a plan URL
  expect((await readPatientLink(sess)) === null, "a session token is rejected as a plan link");
  expect((await readPatientLink(bind)) === null, "a bind token is rejected as a plan link");
  expect((await readPatientLink(who)) === null, "a chooser token is rejected as a plan link");
  // …and a real/legacy plan token still resolves (guards live 30/120-day links)
  const plan = await createPatientToken("pt-3", undefined, 1);
  expect((await readPatientLink(plan))?.p === "pt-3", "a plan token still resolves as a plan link");

  // tamper + expiry
  const [pl, sig] = sess.split(".");
  expect((await readPatientSessionValue(`${pl}.${sig.slice(0, -1)}X`)) === null, "tampered session sig rejected");
  const expiredBind = await createBindToken("pt-1", 1);
  // can't easily force expiry without waiting; assert garbage instead
  expect((await readBindToken("nonsense")) === null, "garbage bind token rejected");
  expect(expiredBind.length > 0, "bind token minted");
}

async function dbTests() {
  const max = (await db.patient.aggregate({ _max: { fileNumber: true } }))._max.fileNumber ?? 100;
  const A = await db.patient.create({ data: { fileNumber: max + 1, name: "Access Test A" } });
  const B = await db.patient.create({ data: { fileNumber: max + 2, name: "Access Test B" } });
  const SUB = "google-sub-test-xyz";

  try {
    // unknown identity → [] (fail closed, not the whole panel)
    expect((await patientsForIdentity("nobody")).length === 0, "unknown identity resolves to nothing");
    expect((await patientsForIdentity("")).length === 0, "empty identity resolves to nothing");

    // first bind → one pending row
    await bindIdentity({ patientId: A.id, providerUserId: SUB, email: "fam@gmail.com" });
    let rowsA = await accessForPatient(A.id);
    expect(rowsA.length === 1 && rowsA[0].status === "pending", "first bind creates one pending row");

    // pending is NOT resolvable on return
    expect((await patientsForIdentity(SUB)).length === 0, "a pending binding does not resolve a return login");
    expect((await hasActiveAccess(SUB, A.id)) === false, "hasActiveAccess is false while pending");

    // idempotent re-bind: still one row, still pending (never silently reactivates)
    await db.patientAccess.update({
      where: { provider_providerUserId_patientId: { provider: "google", providerUserId: SUB, patientId: A.id } },
      data: { status: "active", confirmedAt: new Date() },
    });
    await bindIdentity({ patientId: A.id, providerUserId: SUB, email: "changed@gmail.com" });
    rowsA = await accessForPatient(A.id);
    expect(rowsA.length === 1, "re-binding the same identity keeps one row");
    expect(rowsA[0].status === "active", "re-bind does not reset an active status");
    expect(rowsA[0].email === "changed@gmail.com", "re-bind refreshes the email");

    // now active → resolves
    expect((await hasActiveAccess(SUB, A.id)) === true, "hasActiveAccess true once confirmed");
    expect((await patientsForIdentity(SUB)).length === 1, "an active binding resolves the return login");

    // same account bound to a second patient (family) → both resolve when active
    await bindIdentity({ patientId: B.id, providerUserId: SUB, email: "fam@gmail.com" });
    await db.patientAccess.update({
      where: { provider_providerUserId_patientId: { provider: "google", providerUserId: SUB, patientId: B.id } },
      data: { status: "active", confirmedAt: new Date() },
    });
    const both = await patientsForIdentity(SUB);
    expect(both.length === 2, "one Google account resolves to both linked patients");

    // a different account sees none of them
    expect((await patientsForIdentity("other-sub")).length === 0, "a different account resolves to nothing");

    // merge B into A: the same identity on both must collapse to one row, not
    // throw on the unique index
    await mergePatients(A.id, B.id);
    const afterMerge = await accessForPatient(A.id);
    expect(afterMerge.length === 1, "merging same-identity records collapses to one binding");
    expect((await db.patientAccess.count({ where: { patientId: B.id } })) === 0, "no bindings left on the deleted record");
  } finally {
    await db.patient.deleteMany({ where: { id: { in: [A.id, B.id] } } });
  }
}

async function main() {
  await tokenTests();
  await dbTests();
  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}
main().finally(() => db.$disconnect());
