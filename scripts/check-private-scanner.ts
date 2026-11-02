import assert from "node:assert/strict";
import { scanAssessmentBytes } from "../src/lib/assessment-scanner";

async function main() {
  if (!process.env.MEDSPACE_CLAMAV_HOST) {
    assert(process.env.MEDSPACE_REQUIRE_PRIVATE_SCANNER !== "true", "A private scanner is required but no endpoint is configured");
    console.log("SKIP private scanner integration: no endpoint configured; documents stay quarantined");
    return;
  }
  const clean = new TextEncoder().encode("SYNTHETIC private scanner readiness control");
  const infected = new TextEncoder().encode("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
  assert.equal(await scanAssessmentBytes(clean), "clean", "Private scanner must accept the synthetic clean control");
  assert.equal(await scanAssessmentBytes(infected), "infected", "Private scanner must detect the EICAR control");
  console.log("PASS private scanner clean/infected readiness controls; no clinical files used");
}

main().catch(() => { console.error("FAIL private scanner readiness; documents must remain locked"); process.exitCode = 1; });
