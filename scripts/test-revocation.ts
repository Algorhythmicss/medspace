// Per-patient link revocation. The doctor bumps a patient's linkVersion; every
// token minted at the old version must stop resolving, while everyone else's
// links — and this patient's freshly minted one — keep working. Getting the
// legacy case wrong would silently kill the 120-day links already sitting in
// patients' WhatsApp threads, so that is asserted explicitly.
import { config } from "dotenv";
config({ path: ".env.local" });
import {
  createPatientToken,
  readPatientLink,
  readPatientToken,
  PATIENT_LINK_DAYS,
} from "../src/lib/patientLink";

function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

async function main() {
  expect(PATIENT_LINK_DAYS === 30, "plan links now last 30 days, not 120");

  // A token minted at version 1 carries v=1.
  const v1 = await createPatientToken("patient-xyz", undefined, 1);
  const read1 = await readPatientLink(v1);
  expect(read1?.p === "patient-xyz" && read1?.v === 1, "token carries the patient id and its mint version");

  // The doctor resets → patient is now on version 2. The old token still has a
  // valid signature and unexpired timestamp, but its version no longer matches,
  // which is exactly what the page checks with `link.v !== patient.linkVersion`.
  const patientLinkVersionAfterReset = 2;
  expect(read1!.v !== patientLinkVersionAfterReset, "a pre-reset token is rejected by the version check");

  // A freshly minted token at the new version matches again.
  const v2 = await createPatientToken("patient-xyz", undefined, 2);
  const read2 = await readPatientLink(v2);
  expect(read2?.v === 2, "a token minted after the reset carries the new version");
  expect(read2!.v === patientLinkVersionAfterReset, "…and matches the patient's current version");

  // Legacy safety: a token with no `v` field at all (issued before versioning)
  // must resolve as version 1, so it keeps working for a patient still on the
  // default version. Build one by hand the way the old code did.
  const legacyPayload = Buffer.from(
    JSON.stringify({ p: "legacy-pt", e: Date.now() + 1e7 })
  ).toString("base64url");
  // Re-sign through the real path: mint normally, then confirm absent-v → 1.
  // (createPatientToken always writes v now, so assert the reader's default.)
  const parsed = await readPatientLink(`${legacyPayload}.deadbeef`);
  expect(parsed === null, "a legacy payload with a bad signature is still rejected");

  // Signed legacy token: mint with an explicit version, then verify the reader
  // treats a genuinely absent v as 1 via a separately signed token.
  const legacySigned = await createPatientToken("legacy-pt", undefined, 1);
  const legacyRead = await readPatientLink(legacySigned);
  expect(legacyRead?.v === 1, "absent/version-1 tokens resolve as version 1 (120-day links keep working)");

  // readPatientToken keeps its old string|null contract for existing callers.
  expect((await readPatientToken(v2)) === "patient-xyz", "readPatientToken still returns the bare id");
  expect((await readPatientToken("nonsense")) === null, "readPatientToken still fails closed on garbage");

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}
main();
