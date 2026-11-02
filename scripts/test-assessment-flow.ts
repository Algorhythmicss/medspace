import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { createPatientToken, createPatientSession, createBindToken } from "../src/lib/patientLink";
import { createSessionValue } from "../src/lib/auth";

const database = new URL(process.env.DATABASE_URL || "http://missing.invalid");
const base = new URL(process.env.MEDSPACE_ASSESSMENT_TEST_URL || "http://127.0.0.1:3002");
assert(["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) && database.pathname === "/medspace_assessment_test", "Only the dedicated local assessment database may be tested");
assert(["localhost", "127.0.0.1", "[::1]"].includes(base.hostname), "This suite never writes to a hosted app");
const output = resolve(process.env.MEDSPACE_ASSESSMENT_TEST_OUTPUT || "../tmp/patient-assessment-20261102/browser");
const patientIds: string[] = [];
const checks: string[] = [];
let clinicCreated = false;
let browser: { close(): Promise<void> } | undefined;

function record(label: string) { checks.push(label); console.log(`PASS ${label}`); }
function form(concern = "SYNTHETIC concern for the local security test") {
  const value = new FormData(); value.set("concern", concern); value.set("duration", "Two days; no recent change"); value.set("context", "SYNTHETIC medicine/allergy information; not verified"); value.set("consent", "yes"); return value;
}

async function main() {
  await mkdir(output, { recursive: true });
  const existingClinic = await db.clinic.findUnique({ where: { id: "clinic" } });
  if (!existingClinic) { await db.clinic.create({ data: { clinicName: "Synthetic assessment test clinic", doctorName: "Synthetic clinician", regNumber: "SYNTHETIC-NOT-FOR-CARE" } }); clinicCreated = true; }
  const max = (await db.patient.aggregate({ _max: { fileNumber: true } }))._max.fileNumber || 0;
  async function patient(number: number) {
    const value = await db.patient.create({ data: { name: `SYNTHETIC patient ${number}`, fileNumber: max + number, ageYears: 30, language: "en" } }); patientIds.push(value.id); return value;
  }
  const first = await patient(1); const second = await patient(2); const quota = await patient(3);
  const token = await createPatientToken(first.id); const secondToken = await createPatientToken(second.id);
  await db.queueEntry.createMany({ data: [first, second, quota].map((patient) => ({ patientId: patient.id, status: "waiting" })) });
  await db.initialAssessment.createMany({ data: (["reviewed", "dismissed"] as const).map((status) => ({ patientId: quota.id, submissionKey: randomUUID(), payloadHash: "a".repeat(64), concern: "SYNTHETIC completed assessment", duration: "Not applicable", context: "Not clinical information", status, createdAt: new Date(Date.now() - 2 * 86400000), reviewedAt: new Date() })) });
  const doctorCookie = `medspace_session=${await createSessionValue("doctor")}`;
  const staffValue = await createSessionValue("staff");
  async function post(body: FormData, credential = token, extra: Record<string, string> = {}, key = randomUUID()) {
    return fetch(new URL("/api/patient/assessment", base), { method: "POST", body, redirect: "manual", headers: { Origin: base.origin, Authorization: `Bearer ${credential}`, "Idempotency-Key": key, ...extra } });
  }
  const anonymous = await fetch(new URL("/api/patient/assessment", base), { method: "POST", body: form(), headers: { Origin: base.origin, "Idempotency-Key": randomUUID() } });
  assert.equal(anonymous.status, 401); record("anonymous assessment writes are denied");
  for (const cookie of [doctorCookie, `medspace_staff=${staffValue}`, `medspace_session=${staffValue}`]) {
    const response = await fetch(new URL("/api/patient/assessment", base), { method: "POST", body: form(), headers: { Origin: base.origin, "Idempotency-Key": randomUUID(), Cookie: cookie } }); assert.equal(response.status, 401);
  }
  record("doctor, staff and renamed staff cookies cannot impersonate a patient");
  assert.equal((await post(form(), token, { Origin: "https://attacker.invalid" })).status, 403); record("cross-origin authenticated submissions are denied");
  for (const credential of [await createPatientToken(first.id, -1), await createBindToken(first.id, 1), `${token.slice(0, -3)}bad`]) assert.equal((await post(form(), credential)).status, 401);
  record("expired, forged and wrong-kind patient tokens are denied");
  const extra = form(); extra.set("patientId", second.id); assert.equal((await post(extra)).status, 400); record("a submitted patient ID cannot redirect ownership");
  const missingConsent = form(); missingConsent.delete("consent"); assert.equal((await post(missingConsent)).status, 400); record("consent is enforced server-side");
  const spoof = form(); spoof.append("files", new File(["<svg onload='alert(1)'/>"] , "spoof.png", { type: "image/png" })); assert.equal((await post(spoof)).status, 415); record("spoofed executable image content is rejected through the real HTTP boundary");
  const photo = await sharp({ create: { width: 24, height: 24, channels: 3, background: "white" } }).png().toBuffer();
  const payload = form(); payload.append("files", new File([new Uint8Array(photo)], "synthetic-photo.png", { type: "image/png" })); payload.append("files", new File(["SYNTHETIC report for local test"], "synthetic-report.txt", { type: "text/plain" }));
  const key = randomUUID(); const created = await post(payload, token, {}, key); assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
  const receipt = await created.json(); assert.equal(receipt.files.length, 2); record("patient answers and multiple attachments persist with an explicit receipt");
  const retry = await post(payload, token, {}, key); assert.equal(retry.status, 200); assert.equal((await retry.json()).id, receipt.id); record("HTTP retry returns the same assessment without duplicating files");
  const altered = form("Different synthetic concern"); assert.equal((await post(altered, token, {}, key)).status, 409); record("reusing a submission key with different answers cannot overwrite a receipt");
  const imageFile = receipt.files.find((file: { scanStatus: string }) => file.scanStatus === "rewritten");
  const documentFile = receipt.files.find((file: { scanStatus: string }) => file.scanStatus === "quarantined");
  assert(imageFile && documentFile);
  async function getFile(id: string, headers: Record<string, string> = {}) { return fetch(new URL(`/api/assessment-files/${id}`, base), { headers, redirect: "manual" }); }
  const unauthorizedReaders: Record<string, string>[] = [{}, { Cookie: `medspace_staff=${staffValue}` }, { Cookie: `medspace_session=${staffValue}` }, { Authorization: `Bearer ${secondToken}` }];
  for (const headers of unauthorizedReaders) assert.equal((await getFile(imageFile.id, headers)).status, 404);
  record("anonymous, staff, role-swapped and cross-patient file reads fail closed");
  const imageResponse = await getFile(imageFile.id, { Authorization: `Bearer ${token}` }); assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "application/octet-stream"); assert(imageResponse.headers.get("content-disposition")?.startsWith("attachment;")); assert(imageResponse.headers.get("content-security-policy")?.includes("sandbox")); assert(imageResponse.headers.get("cache-control")?.includes("no-store")); assert.equal(imageResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal((await sharp(Buffer.from(await imageResponse.arrayBuffer())).metadata()).format, "webp"); record("authorized downloads are rewritten opaque attachments with sandbox and no-store headers");
  assert.equal((await getFile(imageFile.id, { Cookie: doctorCookie })).status, 200); record("the authenticated doctor can retrieve a rewritten attachment");
  const quarantinedReaders: Record<string, string>[] = [{ Authorization: `Bearer ${token}` }, { Cookie: doctorCookie }];
  for (const headers of quarantinedReaders) assert.equal((await getFile(documentFile.id, headers)).status, 423);
  record("unscanned documents cannot be downloaded even by their patient or doctor");

  const { chromium } = await import(process.env.MEDSPACE_PLAYWRIGHT_MODULE || "playwright");
  const realBrowser = await chromium.launch({ headless: true, executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" }); browser = realBrowser;
  const patientContext = await realBrowser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Kolkata" });
  const page = await patientContext.newPage(); const pageErrors: string[] = []; const external: string[] = [];
  page.on("pageerror", (error: Error) => pageErrors.push(error.message));
  page.on("request", (request: { url(): string }) => { const address = new URL(request.url()); if (["http:", "https:"].includes(address.protocol) && address.origin !== base.origin) external.push(address.origin); });
  await page.goto(new URL(`/p/${secondToken}`, base).href, { waitUntil: "networkidle" });
  await page.getByText("Three questions before your visit", { exact: true }).waitFor();
  assert.equal(await page.locator('textarea[name="concern"]').count(), 1);
  await page.locator('textarea[name="concern"]').fill("SYNTHETIC mobile browser concern <script>window.assessmentInjected=true</script>");
  await page.locator('textarea[name="duration"]').fill("Since yesterday, unchanged");
  await page.locator('textarea[name="context"]').fill("Not sure; please ask me at the clinic");
  await page.getByLabel("Add photos or files", { exact: true }).setInputFiles({ name: "browser-photo.png", mimeType: "image/png", buffer: photo });
  await page.getByRole("checkbox", { name: /These answers and files/ }).check();
  await page.getByRole("button", { name: "Send assessment", exact: true }).click();
  await page.getByText("Assessment received", { exact: true }).waitFor(); record("mobile patient UI submits the three questions and a photo successfully");
  await page.getByText(/Your recent assessments/).click();
  await page.getByText("SYNTHETIC mobile browser concern <script>window.assessmentInjected=true</script>", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => Boolean((window as unknown as { assessmentInjected?: boolean }).assessmentInjected)), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await page.screenshot({ path: resolve(output, "patient-mobile.png"), fullPage: true }); record("submitted markup is rendered as text and the 390px patient view has no overflow");
  await page.reload({ waitUntil: "networkidle" }); await page.getByText(/Your recent assessments/).click();
  await page.getByText("SYNTHETIC mobile browser concern <script>window.assessmentInjected=true</script>", { exact: true }).waitFor(); record("patient answers and attachment state survive a real page reload");
  await page.goto(new URL(`/p/${secondToken}?lang=hi`, base).href, { waitUntil: "networkidle" }); await page.getByText("मुलाकात से पहले तीन सवाल", { exact: true }).waitFor(); record("the initial assessment is accessible in the Hindi patient view");
  const cookiePatientContext = await realBrowser.newContext(); await cookiePatientContext.addCookies([{ name: "medspace_patient", value: await createPatientSession(second.id, 1), url: base.origin }]);
  const signedInPage = await cookiePatientContext.newPage(); await signedInPage.goto(new URL("/plan", base).href, { waitUntil: "networkidle" }); await signedInPage.getByText("Three questions before your visit", { exact: true }).waitFor(); record("returning patient sessions expose the same assessment without a token URL");
  const doctorContext = await realBrowser.newContext({ viewport: { width: 1440, height: 1000 } }); await doctorContext.addCookies([{ name: "medspace_session", value: doctorCookie.split("=")[1], url: base.origin }]);
  const doctorPage = await doctorContext.newPage(); doctorPage.on("pageerror", (error: Error) => pageErrors.push(error.message));
  await doctorPage.goto(base.href, { waitUntil: "networkidle" });
  const firstReviewLink = doctorPage.getByRole("link", { name: `Review 1 assessment for ${first.name}`, exact: true });
  const secondReviewLink = doctorPage.getByRole("link", { name: `Review 1 assessment for ${second.name}`, exact: true });
  await firstReviewLink.waitFor(); await secondReviewLink.waitFor();
  assert.equal(await doctorPage.locator(`a[href="/patients/${quota.id}#assessment-review"]`).count(), 0);
  assert.equal(await doctorPage.getByText("SYNTHETIC mobile browser concern <script>window.assessmentInjected=true</script>", { exact: true }).count(), 0);
  record("the doctor waiting list shows pending counts without assessment answers or reviewed/dismissed badges");
  await doctorPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(await doctorPage.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
  await doctorPage.screenshot({ path: resolve(output, "doctor-queue-mobile.png"), fullPage: true });
  await secondReviewLink.click();
  await doctorPage.getByRole("heading", { name: "Patient assessments", exact: true }).waitFor();
  assert.equal(new URL(doctorPage.url()).hash, "#assessment-review");
  const sectionTop = await doctorPage.locator("#assessment-review").evaluate((element: Element) => element.getBoundingClientRect().top);
  assert(sectionTop >= 0 && sectionTop < 844, "The queue shortcut must bring the review section into the phone viewport");
  record("the phone waiting-list shortcut opens the correct patient's visible assessment review section");
  await doctorPage.setViewportSize({ width: 1440, height: 1000 });
  await doctorPage.goto(new URL(`/patients/${second.id}`, base).href, { waitUntil: "networkidle" }); await doctorPage.getByRole("heading", { name: "Patient assessments", exact: true }).waitFor(); await doctorPage.getByText("SYNTHETIC mobile browser concern <script>window.assessmentInjected=true</script>", { exact: true }).waitFor();
  await doctorPage.screenshot({ path: resolve(output, "doctor-desktop.png"), fullPage: true });
  const reviewTarget = await db.initialAssessment.findFirstOrThrow({ where: { patientId: second.id }, select: { id: true } });
  const reviewRequestPromise = doctorPage.waitForRequest((request: { method(): string; url(): string }) => request.method() === "POST" && new URL(request.url()).pathname === `/patients/${second.id}`);
  const reviewResponsePromise = doctorPage.waitForResponse((response: { request(): { method(): string }; url(): string }) => response.request().method() === "POST" && new URL(response.url()).pathname === `/patients/${second.id}`);
  await doctorPage.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  const reviewRequest = await reviewRequestPromise;
  await reviewResponsePromise;
  await doctorPage.getByText(/Patient-reported ·.*· Reviewed/).waitFor();
  const reviewed = await db.initialAssessment.findFirst({ where: { patientId: second.id }, select: { status: true } }); assert.equal(reviewed?.status, "reviewed");
  assert.equal(await db.condition.count({ where: { patientId: second.id } }), 0); assert.equal(await db.allergy.count({ where: { patientId: second.id } }), 0); record("doctor review works without promoting patient text to verified chart facts");
  await doctorPage.goto(base.href, { waitUntil: "networkidle" });
  assert.equal(await doctorPage.locator(`a[href="/patients/${second.id}#assessment-review"]`).count(), 0);
  await doctorPage.getByRole("link", { name: `Review 1 assessment for ${first.name}`, exact: true }).waitFor();
  record("reviewing an assessment removes only that patient's pending shortcut from the waiting list");
  const reviewBody = reviewRequest.postDataBuffer(); assert(reviewBody && reviewBody.toString().includes(reviewTarget.id));
  const forgedBody = reviewBody.toString().replaceAll(reviewTarget.id, receipt.id);
  const actionHeaders = reviewRequest.headers();
  // Browser headers use lowercase names. Remove the captured origin before
  // supplying our explicit Origin, or Fetch combines both into an invalid URL.
  const replayHeaders = Object.fromEntries(Object.entries(actionHeaders).filter(([name]) => !["host", "cookie", "origin", "content-length", "connection", "accept-encoding"].includes(name.toLowerCase())));
  const control = await fetch(new URL("/welcome", base), { method: "POST", redirect: "manual", body: forgedBody, headers: { ...replayHeaders, Origin: base.origin, Cookie: doctorCookie } });
  await control.text();
  assert.equal((await db.initialAssessment.findUniqueOrThrow({ where: { id: receipt.id }, select: { status: true } })).status, "reviewed", "The captured action replay must work for an authorized doctor before trusting denial checks");
  await db.initialAssessment.update({ where: { id: receipt.id }, data: { status: "pending", reviewedAt: null } });
  for (const cookie of ["", `medspace_staff=${staffValue}`, `medspace_session=${staffValue}`]) {
    const denied = await fetch(new URL("/welcome", base), { method: "POST", redirect: "manual", body: forgedBody, headers: { ...replayHeaders, Origin: base.origin, ...(cookie ? { Cookie: cookie } : {}) } });
    const forwardedDenial = denied.status === 200 && denied.headers.get("content-type")?.startsWith("application/json") && (await denied.text()) === "{}";
    assert(forwardedDenial || [303, 307].includes(denied.status) || denied.headers.get("x-action-redirect")?.includes("/login"), "A valid action replay must produce the framework's auth-denial response");
    assert.equal((await db.initialAssessment.findUniqueOrThrow({ where: { id: receipt.id }, select: { status: true } })).status, "pending");
  }
  record("replaying a real doctor review action on a public route cannot bypass role checks");
  await doctorPage.goto(new URL(`/patients/${first.id}`, base).href, { waitUntil: "networkidle" }); await doctorPage.getByRole("button", { name: "Retry private safety scan", exact: true }).click(); await doctorPage.getByText(/private malware scanner is unavailable/).waitFor(); assert.equal((await getFile(documentFile.id, { Cookie: doctorCookie })).status, 423); record("an unavailable scanner retry remains visibly quarantined");
  const cookieResponse = await fetch(new URL("/api/patient/assessment", base), { method: "POST", body: form("SYNTHETIC cookie submission"), headers: { Origin: base.origin, "Idempotency-Key": randomUUID(), Cookie: `medspace_patient=${await createPatientSession(second.id, 1)}` } }); assert.equal(cookieResponse.status, 201); record("patient-cookie assessment submission works without bearer credentials");
  const quotaToken = await createPatientToken(quota.id);
  for (let index = 0; index < 3; index += 1) assert.equal((await post(form(`SYNTHETIC quota ${index}`), quotaToken)).status, 201);
  assert.equal((await post(form("SYNTHETIC one too many"), quotaToken)).status, 429); record("the real HTTP endpoint enforces the pending submission quota");
  await db.patient.update({ where: { id: first.id }, data: { linkVersion: 2 } });
  assert.equal((await post(form(), token)).status, 401); assert.equal((await getFile(imageFile.id, { Authorization: `Bearer ${token}` })).status, 404); record("revoking a care link blocks both future submissions and existing file downloads");
  assert.equal(await db.initialAssessment.count({ where: { patientId: first.id } }), 1);
  assert.deepEqual(pageErrors, []); assert.deepEqual(external, []); record("bounded patient/browser run has no page errors or external requests");
  await writeFile(resolve(output, "results.json"), JSON.stringify({ source: "local production build", completedAt: new Date().toISOString(), checks, browserErrors: pageErrors, externalRequests: external, syntheticOnly: true }, null, 2));
  console.log(`ALL PASS: ${checks.length} local HTTP/browser checks`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close();
  if (patientIds.length) await db.patient.deleteMany({ where: { id: { in: patientIds } } });
  if (clinicCreated) await db.clinic.delete({ where: { id: "clinic" } });
  await db.$disconnect();
});
