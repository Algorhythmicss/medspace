import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { doctorAudio } from "../src/lib/care-media";
async function main() {
  if (process.argv[2] !== "--child") {
    const result = spawnSync(
      process.execPath,
      [
        "--no-experimental-require-module",
        "--import",
        "tsx",
        process.argv[1],
        "--child",
      ],
      { stdio: "inherit", env: process.env },
    );
    assert.equal(
      result.status,
      0,
      "The hosted-runtime audio controls must pass",
    );
    return;
  }
  const packageRequire = createRequire(join(process.cwd(), "package.json"));
  assert.throws(
    () => packageRequire.resolve("music-metadata"),
    (error: unknown) =>
      !!error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ERR_PACKAGE_PATH_NOT_EXPORTED",
  );
  console.log(
    "PASS the runtime counterfactual reproduces the import-only package resolution failure",
  );
  const bytes = readFileSync("scripts/fixtures/synthetic-doctor-message.webm");
  const result = await doctorAudio(
    new File([bytes], "synthetic.webm", { type: "audio/webm" }),
    1200,
  );
  assert.equal(result.mime, "audio/webm");
  assert(result.durationMs > 0 && result.durationMs <= 120000);
  await assert.rejects(() =>
    doctorAudio(
      new File([Buffer.from("not audio")], "spoof.webm", {
        type: "audio/webm",
      }),
      1200,
    ),
  );
  console.log(
    "PASS import-only runtime validates the real browser fixture and still rejects spoofed audio",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
