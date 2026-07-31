// The patient link IS the credential — forging or tampering with one must not
// open somebody's medical record. These assertions guard that.
import { config } from "dotenv";
config({ path: ".env.local" });
import { createPatientToken, readPatientToken } from "../src/lib/patientLink";
import { plainFrequency } from "../src/lib/dosage";

function expect(cond: boolean, label: string) {
  if (!cond) {
    console.error(`FAIL: ${label}`);
    process.exitCode = 1;
  } else console.log(`ok: ${label}`);
}

async function main() {
  const token = await createPatientToken("patient-abc");
  expect((await readPatientToken(token)) === "patient-abc", "a valid token resolves to its patient");

  const [payload, sig] = token.split(".");
  expect((await readPatientToken(`${payload}.${sig.slice(0, -1)}X`)) === null, "tampered signature is rejected");

  // swap the payload for another patient, keep the original signature
  const forged = Buffer.from(JSON.stringify({ p: "somebody-else", e: Date.now() + 1e6, v: 1 }))
    .toString("base64url");
  expect((await readPatientToken(`${forged}.${sig}`)) === null, "re-pointing a token at another patient is rejected");

  expect((await readPatientToken("nonsense")) === null, "garbage is rejected");
  expect((await readPatientToken("")) === null, "empty token is rejected");

  const expired = await createPatientToken("patient-abc", -1);
  expect((await readPatientToken(expired)) === null, "an expired link no longer opens");

  // dosage translation — what the patient actually reads
  expect(plainFrequency("1-0-1") === "Morning and night", '"1-0-1" reads as "Morning and night"');
  expect(plainFrequency("1-1-1") === "Morning, afternoon and night", '"1-1-1" spells out all three');
  expect(plainFrequency("0-0-1") === "Night", '"0-0-1" reads as "Night"');
  expect(plainFrequency("SOS") === "Only when needed", '"SOS" reads as plain language');

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}
main();
