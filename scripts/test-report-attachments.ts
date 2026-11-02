import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { AssessmentError } from "../src/lib/assessment";
import { MAX_REPORT_FILE_BYTES, prepareReportAttachment, prepareReportDownload } from "../src/lib/report-attachments";

let checks = 0;
async function check(name: string, body: () => unknown | Promise<unknown>) {
  await body();
  checks += 1;
  console.log(`PASS ${name}`);
}

type StoredFile = { fileName: string; fileMime: string; fileData: Uint8Array<ArrayBuffer> };
type Download = typeof import("../src/app/api/reports/[id]/file/route").GET;
function route(authorized: boolean, stored: StoredFile | null, bypass = false) {
  let queries = 0;
  const sandboxModule = { exports: {} as { GET: Download } };
  const output = transpileModule(readFileSync("src/app/api/reports/[id]/file/route.ts", "utf8"), { compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 } }).outputText;
  runInNewContext(output, {
    module: sandboxModule, exports: sandboxModule.exports, Uint8Array, encodeURIComponent,
    console: { error: () => {} },
    require: (name: string) => {
      if (name === "next/server") return { NextResponse };
      if (name === "@/lib/db") return { db: { report: { findUnique: async () => { queries += 1; return stored; } } } };
      if (name === "@/lib/session") return { hasClinicSession: async () => authorized };
      if (name === "@/lib/assessment") return { AssessmentError };
      if (name === "@/lib/report-attachments") return { prepareReportDownload: bypass ? async (file: { name: string; mime: string; bytes: Uint8Array }) => file : prepareReportDownload };
      throw new Error(`Unexpected route dependency: ${name}`);
    },
  });
  return { get: () => sandboxModule.exports.GET(new Request("https://synthetic.invalid/api/reports/synthetic/file"), { params: Promise.resolve({ id: "synthetic-report" }) }), queries: () => queries };
}

function privateResponse(response: Response) {
  assert.match(response.headers.get("cache-control") || "", /private.*no-store/);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("content-security-policy"), "default-src 'none'; sandbox; frame-ancestors 'none'");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
}

async function main() {
  const scannerBefore = process.env.MEDSPACE_CLAMAV_HOST;
  delete process.env.MEDSPACE_CLAMAV_HOST;
  try {
    const photo = new Uint8Array(await sharp({ create: { width: 20, height: 20, channels: 3, background: "white" } }).jpeg().withExif({ IFD0: { Artist: "SYNTHETIC PRIVATE METADATA" } }).toBuffer());
    const pdf = { name: "synthetic.pdf", mime: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4\nSYNTHETIC FILE FIXTURE\n%%EOF") };
    await check("legacy photos are rewritten without metadata or appended payloads", async () => {
      const file = await prepareReportAttachment({ name: "synthetic.jpg", mime: "image/jpeg", bytes: new Uint8Array(Buffer.concat([photo, Buffer.from("SYNTHETIC APPENDED PAYLOAD")])) });
      assert.equal(file.name, "synthetic.webp");
      assert.equal(file.scanStatus, "rewritten");
      assert.equal((await sharp(file.bytes).metadata()).exif, undefined);
      assert(!Buffer.from(file.bytes).includes(Buffer.from("SYNTHETIC APPENDED PAYLOAD")));
    });
    await check("legacy MIME and filename spoofing cannot bypass inspection", async () => {
      await assert.rejects(() => prepareReportAttachment({ name: "photo.jpg", mime: "application/pdf", bytes: photo }), AssessmentError);
      for (const name of ["../photo.jpg", "photo\r\n.jpg", "photo\u202e.jpg", "program.exe", "active.svg"]) await assert.rejects(() => prepareReportAttachment({ name, mime: "image/jpeg", bytes: photo }), AssessmentError);
    });
    await check("legacy writes reject empty, oversized and disguised executable content", async () => {
      for (const bytes of [new Uint8Array(), new Uint8Array(MAX_REPORT_FILE_BYTES + 1), new TextEncoder().encode("<html><script>untrusted</script></html>")]) await assert.rejects(() => prepareReportAttachment({ ...pdf, bytes }), AssessmentError);
    });
    await check("documents stay quarantined without a private scanner", async () => {
      assert.equal((await prepareReportAttachment(pdf)).scanStatus, "quarantined");
      await assert.rejects(() => prepareReportDownload(pdf), (error: unknown) => error instanceof AssessmentError && error.status === 423);
    });
    await check("only a clean scanner verdict makes a document available", async () => {
      assert.equal((await prepareReportAttachment(pdf, async () => "clean")).scanStatus, "clean");
      assert.equal((await prepareReportAttachment(pdf, async () => "unavailable")).scanStatus, "quarantined");
      await assert.rejects(() => prepareReportAttachment(pdf, async () => "infected"), (error: unknown) => error instanceof AssessmentError && error.status === 422);
    });
    await check("legacy anonymous or non-doctor requests query no report bytes", async () => {
      const handler = route(false, { fileName: pdf.name, fileMime: pdf.mime, fileData: pdf.bytes });
      const response = await handler.get();
      assert.equal(response.status, 404); assert.equal(handler.queries(), 0); privateResponse(response);
    });
    await check("legacy missing attachments return a private 404", async () => {
      const response = await route(true, null).get(); assert.equal(response.status, 404); privateResponse(response);
    });
    const storedPdf = { fileName: pdf.name, fileMime: pdf.mime, fileData: pdf.bytes };
    await check("legacy document downloads fail closed without a scan", async () => {
      const response = await route(true, storedPdf).get(); assert.equal(response.status, 423); privateResponse(response);
      assert(!(await response.text()).includes("SYNTHETIC FILE FIXTURE"));
    });
    await check("legacy photo downloads are opaque sandboxed attachments, never inline", async () => {
      const response = await route(true, { fileName: 'synthetic"photo.jpg', fileMime: "image/jpeg", fileData: photo }).get();
      assert.equal(response.status, 200); privateResponse(response);
      assert.equal(response.headers.get("content-type"), "application/octet-stream");
      assert.match(response.headers.get("content-disposition") || "", /^attachment; filename="medical-record.webp";/);
      assert.match(response.headers.get("content-disposition") || "", /synthetic_photo.webp/);
      assert.equal((await sharp(new Uint8Array(await response.arrayBuffer())).metadata()).exif, undefined);
    });
    await check("stored HTML labeled as a PDF is never returned", async () => {
      const response = await route(true, { ...storedPdf, fileData: new TextEncoder().encode("<html>SYNTHETIC ACTIVE FILE</html>") }).get();
      assert.equal(response.status, 423); assert(!(await response.text()).includes("SYNTHETIC ACTIVE FILE"));
    });
    await check("download oracle kills a scan-bypass mutation", async () => {
      const denied = async (get: () => Promise<Response>) => assert.equal((await get()).status, 423);
      await denied(route(true, storedPdf).get);
      await assert.rejects(() => denied(route(true, storedPdf, true).get), assert.AssertionError);
    });
    console.log(`ALL PASS: ${checks} isolated legacy attachment checks`);
  } finally {
    if (scannerBefore === undefined) delete process.env.MEDSPACE_CLAMAV_HOST;
    else process.env.MEDSPACE_CLAMAV_HOST = scannerBefore;
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
