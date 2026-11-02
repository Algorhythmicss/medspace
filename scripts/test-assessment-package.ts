import assert from "node:assert/strict";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readlink, rename, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import sharp from "sharp";
import { assessmentUploadWorker } from "../src/lib/assessment-upload-worker";

const root = process.cwd();
const traces: Record<string, string> = {
  assessment: ".next/server/app/api/patient/assessment/route.js.nft.json",
  report: ".next/server/app/api/reports/[id]/file/route.js.nft.json",
  "patient-page": ".next/server/app/plan/page.js.nft.json",
  "report-page": ".next/server/app/patients/[id]/report/new/page.js.nft.json",
  "staff-page": ".next/server/app/queue/intake/[patientId]/page.js.nft.json",
};
const traceName = process.argv[2] || "assessment";
assert(Object.hasOwn(traces, traceName), "Choose an explicitly supported upload trace");
const manifestPath = resolve(traces[traceName]);

async function inspect(bytes: Uint8Array, extension: string, packageRequire: ReturnType<typeof createRequire>) {
  return new Promise<{ kind: string; error?: boolean }>((accept, reject) => {
    const diagnosticWorker = assessmentUploadWorker.replace("run().catch(() => parentPort.postMessage({ error: true }));", "run().catch((error) => parentPort.postMessage({ error: true, details: String(error) }));");
    const worker = new Worker(diagnosticWorker, {
      eval: true,
      resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
      workerData: { bytes, extension, limit: 2 * 1024 * 1024, fileTypeModule: packageRequire.resolve("file-type"), sharpModule: packageRequire.resolve("sharp") },
    });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error("Packaged worker timed out")); }, 5000);
    worker.once("message", (value) => { clearTimeout(timer); void worker.terminate(); if (value.error) reject(new Error(`Packaged worker rejected the fixture: ${value.details}`)); else accept(value); });
    worker.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function main() {
  const temporary = await mkdtemp(join(tmpdir(), "medspace-assessment-package-"));
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as { files: string[] };
    const links: Array<{ destination: string; target: string }> = [];
    const native: string[] = [];
    for (const entry of manifest.files) {
      const original = resolve(dirname(manifestPath), entry);
      const within = relative(root, original);
      assert(!within.startsWith("..") && !isAbsolute(within), "Traces must remain inside this checkout");
      if (!within.startsWith("node_modules/")) continue;
      const destination = join(temporary, within);
      const metadata = await lstat(original);
      if (metadata.isSymbolicLink()) {
        const target = await readlink(original);
        assert(!isAbsolute(target), "Dependency links must be portable relative paths");
        const resolved = relative(root, resolve(dirname(original), target));
        assert(!resolved.startsWith("..") && !isAbsolute(resolved), "Dependency links must not escape this checkout");
        links.push({ destination, target });
      } else if (metadata.isFile()) {
        await mkdir(dirname(destination), { recursive: true });
        await copyFile(original, destination);
        if (/[/@]sharp-[^/]+[/].*\.node$/.test(destination)) native.push(destination);
      }
    }
    for (const link of links) {
      await mkdir(dirname(link.destination), { recursive: true });
      await symlink(link.target, link.destination);
    }
    await writeFile(join(temporary, "package.json"), await readFile(join(root, "package.json")));
    const packageRequire = createRequire(join(temporary, "package.json"));
    const photo = await sharp({ create: { width: 12, height: 12, channels: 3, background: "white" } }).png().toBuffer();
    assert.equal((await inspect(photo, "png", packageRequire)).kind, "image");
    assert.equal((await inspect(new TextEncoder().encode("SYNTHETIC package fixture"), "txt", packageRequire)).kind, "document");
    console.log("PASS trace-only artifact loads image and document workers without the checkout's dependency tree");
    assert(native.length > 0, "The image worker must trace a native Sharp binary for this platform");
    for (const file of native) await rename(file, `${file}.removed`);
    await assert.rejects(() => inspect(photo, "png", packageRequire));
    console.log("PASS the packaging oracle detects an omitted native image decoder");
    console.log(`ALL PASS: 2 trace-only packaging checks for ${traceName}`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
