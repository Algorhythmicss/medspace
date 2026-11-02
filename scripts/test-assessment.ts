import assert from "node:assert/strict";
import { createServer } from "node:net";
import sharp from "sharp";
import {
  assessmentAnswers, AssessmentError, downloadableAssessmentFile,
  ASSESSMENT_BODY_BYTES, ASSESSMENT_FILE_BYTES,
} from "../src/lib/assessment";
import { assertAssessmentOrigin, assessmentPatient, boundedAssessmentForm } from "../src/lib/assessment-server";
import { assessmentRawFiles, prepareAssessmentFiles, safeAssessmentFilename } from "../src/lib/assessment-uploads";
import { scanAssessmentBytes } from "../src/lib/assessment-scanner";

let checks = 0;
async function check(label: string, test: () => unknown | Promise<unknown>) {
  await test();
  checks += 1;
  console.log(`PASS ${label}`);
}

function form() {
  const value = new FormData();
  value.set("concern", "A synthetic concern");
  value.set("duration", "Two days, unchanged");
  value.set("context", "None known; please confirm with me");
  value.set("consent", "yes");
  return value;
}

async function rejects(test: () => unknown | Promise<unknown>, status: number) {
  await assert.rejects(async () => test(), (error: unknown) => error instanceof AssessmentError && error.status === status);
}

function storedZip(entries: [string, string][]): Uint8Array<ArrayBuffer> {
  const local: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const [name, text] of entries) {
    const filename = Buffer.from(name);
    const content = Buffer.from(text);
    let checksum = 0xffffffff;
    for (const byte of content) {
      checksum ^= byte;
      for (let bit = 0; bit < 8; bit += 1) checksum = (checksum >>> 1) ^ ((checksum & 1) ? 0xedb88320 : 0);
    }
    checksum = (checksum ^ 0xffffffff) >>> 0;
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20, 4); header.writeUInt32LE(checksum, 14); header.writeUInt32LE(content.length, 18); header.writeUInt32LE(content.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, content);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(content.length, 20); directory.writeUInt32LE(content.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename); offset += header.length + filename.length + content.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...local, directory, end]));
}

async function fakeScanner(reply: string, test: () => Promise<unknown>) {
  const before = { host: process.env.MEDSPACE_CLAMAV_HOST, port: process.env.MEDSPACE_CLAMAV_PORT, tls: process.env.MEDSPACE_CLAMAV_TLS };
  const server = createServer((socket) => {
    let body = Buffer.alloc(0);
    socket.on("data", (chunk) => {
      body = Buffer.concat([body, chunk]);
      if (body.length < 10 || body.subarray(0, 10).toString() !== "zINSTREAM\0") return;
      let offset = 10;
      while (offset + 4 <= body.length) {
        const length = body.readUInt32BE(offset);
        offset += 4;
        if (length === 0) { socket.end(reply); return; }
        if (offset + length > body.length) return;
        offset += length;
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert(address && typeof address !== "string");
  process.env.MEDSPACE_CLAMAV_HOST = "127.0.0.1";
  process.env.MEDSPACE_CLAMAV_PORT = String(address.port);
  delete process.env.MEDSPACE_CLAMAV_TLS;
  try { await test(); } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    for (const [key, value] of Object.entries({ MEDSPACE_CLAMAV_HOST: before.host, MEDSPACE_CLAMAV_PORT: before.port, MEDSPACE_CLAMAV_TLS: before.tls })) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
}

async function main() {
  delete process.env.MEDSPACE_CLAMAV_HOST;
  await check("three fixed answers normalize without truncation", () => {
    const input = form(); input.set("concern", "  cafe\u0301  ");
    assert.equal(assessmentAnswers(input).concern, "café");
  });
  await check("missing, duplicate and oversized answers fail", async () => {
    const missing = form(); missing.delete("duration"); await rejects(() => assessmentAnswers(missing), 400);
    const duplicate = form(); duplicate.append("concern", "override"); await rejects(() => assessmentAnswers(duplicate), 400);
    const oversized = form(); oversized.set("context", "a".repeat(2001)); await rejects(() => assessmentAnswers(oversized), 400);
  });
  await check("hidden control and bidi characters fail", async () => {
    for (const hidden of ["\0", "\u202e", "\u2066"]) { const input = form(); input.set("concern", `safe${hidden}unsafe`); await rejects(() => assessmentAnswers(input), 400); }
  });
  await check("unknown, quarantined and infected statuses cannot download", () => {
    for (const status of ["quarantined", "rejected", "unknown", "", "CLEAN"]) assert.equal(downloadableAssessmentFile(status), false);
    assert.equal(downloadableAssessmentFile("rewritten"), true); assert.equal(downloadableAssessmentFile("clean"), true);
  });
  await check("quarantine-bypass mutation is killed by the download oracle", () => {
    const oracle = (predicate: (status: string) => boolean) => assert.equal(predicate("quarantined"), false);
    oracle(downloadableAssessmentFile);
    assert.throws(() => oracle(() => true), assert.AssertionError);
  });
  await check("filenames reject traversal, CRLF, hidden direction and executable suffixes", async () => {
    for (const name of ["../scan.pdf", "folder\\scan.pdf", "scan\r\n.pdf", "scan\u202e.pdf", "scan:stream.pdf", "CON.pdf", "scan.pdf.exe", "upload.html", "upload.svg", "archive.zip", "macro.docm"]) await rejects(() => safeAssessmentFilename(name), name.endsWith(".exe") || /\.(?:html|svg|zip|docm)$/.test(name) ? 415 : 400);
    assert.equal(safeAssessmentFilename('scan"name.PDF').name, "scan_name.pdf");
  });
  await check("per-file, total and count limits are authoritative", async () => {
    const oversized = form(); oversized.append("files", new File([new Uint8Array(ASSESSMENT_FILE_BYTES + 1)], "big.pdf")); await rejects(() => assessmentRawFiles(oversized), 413);
    const total = form(); for (let count = 0; count < 2; count += 1) total.append("files", new File([new Uint8Array(ASSESSMENT_FILE_BYTES)], `report-${count}.pdf`)); await rejects(() => assessmentRawFiles(total), 413);
    const count = form(); for (let index = 0; index < 4; index += 1) count.append("files", new File(["hello"], `report-${index}.txt`)); await rejects(() => assessmentRawFiles(count), 400);
  });
  await check("origin and fetch-site checks reject cross-site requests", async () => {
    assertAssessmentOrigin(new Request("http://127.0.0.1:3000/api/patient/assessment", { headers: { Origin: "http://127.0.0.1:3000" } }));
    await rejects(() => assertAssessmentOrigin(new Request("http://127.0.0.1:3000/api/patient/assessment", { headers: { Origin: "https://attacker.invalid" } })), 403);
    await rejects(() => assertAssessmentOrigin(new Request("http://127.0.0.1:3000/api/patient/assessment", { headers: { Origin: "http://127.0.0.1:3000", "Sec-Fetch-Site": "cross-site" } })), 403);
  });
  await check("malformed authorization cannot fall back to a cookie", async () => {
    assert.equal(await assessmentPatient(new Request("http://localhost", { headers: { Authorization: "Bearer malformed", Cookie: "medspace_patient=forged" } })), null);
  });
  await check("bounded multipart accepts ordinary form data", async () => {
    const parsed = await boundedAssessmentForm(new Request("http://localhost", { method: "POST", body: form() }));
    assert.equal(parsed.get("duration"), "Two days, unchanged");
  });
  await check("multipart rejects extra ownership fields and duplicate consent", async () => {
    const extra = form(); extra.set("patientId", "someone-else"); await rejects(() => boundedAssessmentForm(new Request("http://localhost", { method: "POST", body: extra })), 400);
    const duplicate = form(); duplicate.append("consent", "yes"); await rejects(() => boundedAssessmentForm(new Request("http://localhost", { method: "POST", body: duplicate })), 400);
  });
  await check("body limits do not trust Content-Length", async () => {
    const body = "a".repeat(ASSESSMENT_BODY_BYTES + 1);
    await rejects(() => boundedAssessmentForm(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "multipart/form-data; boundary=synthetic", "Content-Length": "1" }, body })), 413);
    await rejects(() => boundedAssessmentForm(new Request("http://localhost", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })), 415);
  });
  const photo = await sharp({ create: { width: 16, height: 16, channels: 3, background: "white" } }).jpeg().withExif({ IFD0: { Artist: "SYNTHETIC PRIVATE METADATA" } }).toBuffer();
  await check("photos are decoded, rewritten and stripped of metadata and appended payloads", async () => {
    const source = Buffer.concat([photo, Buffer.from("SYNTHETIC APPENDED SCRIPT PAYLOAD")]);
    const [prepared] = await prepareAssessmentFiles([{ name: "photo.jpg", mime: "image/jpeg", bytes: new Uint8Array(source) }]);
    assert.equal(prepared.mime, "image/webp"); assert.equal(prepared.name, "photo.webp"); assert.equal(prepared.scanStatus, "rewritten");
    const metadata = await sharp(prepared.data).metadata(); assert.equal(metadata.exif, undefined); assert.equal(metadata.icc, undefined);
    assert.equal(Buffer.from(prepared.data).includes(Buffer.from("SYNTHETIC APPENDED")), false);
  });
  await check("spoofed MIME, disguised SVG/HTML and broken images fail", async () => {
    await rejects(() => prepareAssessmentFiles([{ name: "photo.jpg", mime: "image/png", bytes: new Uint8Array(photo) }]), 415);
    for (const [name, content, mime] of [["evil.png", "<svg onload='alert(1)'/>", "image/png"], ["evil.pdf", "<html>executable</html>", "application/pdf"], ["note.txt", "<script>alert(1)</script>", "text/plain"], ["broken.jpg", "not a JPEG", "image/jpeg"]]) await rejects(() => prepareAssessmentFiles([{ name, mime, bytes: new TextEncoder().encode(content) }]), 415);
  });
  await check("ordinary PNG photos are accepted alongside JPEG", async () => {
    const png = await sharp({ create: { width: 24, height: 24, channels: 3, background: "white" } }).png().toBuffer();
    const [prepared] = await prepareAssessmentFiles([{ name: "photo.png", mime: "image/png", bytes: new Uint8Array(png) }]);
    assert.equal(prepared.scanStatus, "rewritten");
  });
  await check("animated images and pixel bombs are rejected without dropping frames", async () => {
    const animated = Buffer.from("47494638396101000100800000000000ffffff21f90400000000002c000000000100010000020244010021f90400000000002c00000000010001000002024401003b", "hex");
    await rejects(() => prepareAssessmentFiles([{ name: "animated.gif", mime: "image/gif", bytes: new Uint8Array(animated) }]), 415);
    const large = await sharp({ create: { width: 4500, height: 4000, channels: 3, background: "white" } }).png().toBuffer();
    await rejects(() => prepareAssessmentFiles([{ name: "bomb.png", mime: "image/png", bytes: new Uint8Array(large) }]), 415);
  });
  const text = { name: "report.txt", mime: "text/plain", bytes: new TextEncoder().encode("Synthetic report, not clinical information.") };
  await check("all advertised document families are detected and quarantined without a scanner", async () => {
    const documents: Array<{ name: string; bytes: Uint8Array<ArrayBuffer> }> = [
      { name: "record.pdf", bytes: new TextEncoder().encode("%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF") },
      { name: "record.rtf", bytes: new TextEncoder().encode("{\\rtf1\\ansi Synthetic record}") },
      { name: "record.docx", bytes: storedZip([["[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'], ["word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>']]) },
      { name: "record.xlsx", bytes: storedZip([["[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/></Types>'], ["xl/workbook.xml", '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>']]) },
      { name: "record.pptx", bytes: storedZip([["[Content_Types].xml", '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>'], ["ppt/presentation.xml", '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>']]) },
    ];
    for (const [extension, mime] of [["odt", "application/vnd.oasis.opendocument.text"], ["ods", "application/vnd.oasis.opendocument.spreadsheet"], ["odp", "application/vnd.oasis.opendocument.presentation"]]) documents.push({ name: `record.${extension}`, bytes: storedZip([["mimetype", mime], ["content.xml", '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"/>']]) });
    for (const document of documents) {
      const [prepared] = await prepareAssessmentFiles([{ ...document, mime: "application/octet-stream" }]);
      assert.equal(prepared.name, document.name); assert.equal(prepared.scanStatus, "quarantined");
    }
  });
  await check("scanner unavailable means persistent quarantine, not a clean verdict", async () => {
    assert.equal(await scanAssessmentBytes(text.bytes), "unavailable");
    const [prepared] = await prepareAssessmentFiles([text]); assert.equal(prepared.scanStatus, "quarantined"); assert.equal(prepared.scannedAt, null);
  });
  await check("remote scanner connections require certificate-verified TLS", async () => {
    process.env.MEDSPACE_CLAMAV_HOST = "scanner.invalid"; delete process.env.MEDSPACE_CLAMAV_TLS;
    assert.equal(await scanAssessmentBytes(text.bytes), "unavailable"); delete process.env.MEDSPACE_CLAMAV_HOST;
  });
  await check("private scanner accepts only an exact clean receipt", async () => {
    await fakeScanner("stream: OK\0", async () => { const [prepared] = await prepareAssessmentFiles([text]); assert.equal(prepared.scanStatus, "clean"); assert(prepared.scannedAt); });
    await fakeScanner("stream: unexpected ERROR\0", async () => { assert.equal(await scanAssessmentBytes(text.bytes), "unavailable"); });
  });
  await check("infected files reject the entire submission", async () => {
    await fakeScanner("stream: Synthetic-Test-Signature FOUND\0", () => rejects(() => prepareAssessmentFiles([text]), 422));
  });
  if (process.env.MEDSPACE_TEST_CLAMAV_PORT) {
    await check("real ClamAV distinguishes clean text from the EICAR test signature", async () => {
      process.env.MEDSPACE_CLAMAV_HOST = "127.0.0.1"; process.env.MEDSPACE_CLAMAV_PORT = process.env.MEDSPACE_TEST_CLAMAV_PORT;
      assert.equal(await scanAssessmentBytes(text.bytes), "clean");
      const eicar = new TextEncoder().encode("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
      assert.equal(await scanAssessmentBytes(eicar), "infected");
    });
  }
  console.log(`ALL PASS: ${checks} assessment security checks`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
