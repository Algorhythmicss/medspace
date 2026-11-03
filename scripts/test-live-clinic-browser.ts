import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";
import { db } from "../src/lib/db";
import {
  createPatientToken,
  createPatientSession,
  createBindToken,
} from "../src/lib/patientLink";
import { createSessionValue } from "../src/lib/auth";

const database = new URL(process.env.DATABASE_URL || "http://missing.invalid");
const base = new URL(
  process.env.MEDSPACE_LIVE_TEST_URL || "http://127.0.0.1:3008",
);
const hosted = process.env.MEDSPACE_LIVE_HOSTED_TEST === "true";
if (hosted) {
  assert(database.hostname.endsWith(".neon.tech"));
  assert.equal(database.pathname, "/medspace_assessment_hosted_test");
  assert.equal(base.origin, "https://medspace-assessment-test.vercel.app");
  assert(process.env.VERCEL_AUTOMATION_BYPASS_SECRET);
} else {
  assert.equal(database.hostname, "127.0.0.1");
  assert.equal(database.pathname, "/medspace_live_clinic_test");
  assert.equal(base.hostname, "127.0.0.1");
}
const bypass: Record<string, string> = hosted
  ? {
      "x-vercel-protection-bypass":
        process.env.VERCEL_AUTOMATION_BYPASS_SECRET!,
    }
  : {};
const output = resolve(
  process.env.MEDSPACE_LIVE_TEST_OUTPUT || "../tmp/live-clinic-browser",
);
const patients: string[] = [],
  checks: string[] = [],
  errors: string[] = [];
let browser: { close(): Promise<void> } | undefined;
function pass(label: string) {
  checks.push(label);
  console.log("PASS " + label);
}
async function until(
  check: () => Promise<unknown>,
  label: string,
  timeout = 15000,
) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("Timed out: " + label);
}
async function main() {
  await mkdir(output, { recursive: true });
  assert(
    (
      await db.clinic.findUniqueOrThrow({ where: { id: "clinic" } })
    ).clinicName.startsWith("SYNTHETIC live clinic"),
  );
  // Remove only this suite's orphaned fixtures after an interrupted prior run.
  await db.patient.deleteMany({
    where: {
      name: {
        in: [
          "SYNTHETIC live first",
          "SYNTHETIC live second",
          "SYNTHETIC browser registration",
        ],
      },
    },
  });
  await db.clinicLiveSettings.updateMany({
    where: { id: "clinic" },
    data: { paused: false, averageMinutes: null },
  });
  const maximum =
    (await db.patient.aggregate({ _max: { fileNumber: true } }))._max
      .fileNumber || 0;
  const first = await db.patient.create({
    data: {
      name: "SYNTHETIC live first",
      fileNumber: maximum + 1,
      ageYears: 30,
      phone: "9876543210",
    },
  });
  const second = await db.patient.create({
    data: {
      name: "SYNTHETIC live second",
      fileNumber: maximum + 2,
      ageYears: 40,
    },
  });
  patients.push(first.id, second.id);
  const token = await createPatientToken(first.id),
    secondToken = await createPatientToken(second.id);
  const doctorValue = await createSessionValue("doctor"),
    staffValue = await createSessionValue("staff");
  const doctorCookie = `medspace_session=${doctorValue}`,
    staffCookie = `medspace_staff=${staffValue}`;
  async function api(
    path = "/api/live",
    cookie = doctorCookie,
    body?: object,
    credential?: string,
    extra: Record<string, string> = {},
  ) {
    return fetch(new URL(path, base), {
      method: body ? "POST" : "GET",
      redirect: "manual",
      headers: {
        ...bypass,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
        ...(body
          ? { "Content-Type": "application/json", Origin: base.origin }
          : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  async function command(
    kind: string,
    value: object = {},
    cookie = doctorCookie,
    id = randomUUID(),
  ) {
    return api("/api/live", cookie, { commandId: id, kind, ...value });
  }
  async function multipart(
    path: string,
    form: FormData,
    cookie = doctorCookie,
    credential?: string,
  ) {
    return fetch(new URL(path, base), {
      method: "POST",
      body: form,
      headers: {
        ...bypass,
        Origin: base.origin,
        ...(cookie ? { Cookie: cookie } : {}),
        ...(credential ? { Authorization: `Bearer ${credential}` } : {}),
      },
    });
  }
  assert.equal((await api("/api/live", "")).status, 401);
  for (const credential of [
    await createBindToken(first.id, 1),
    await createPatientToken(first.id, -1),
    token.slice(0, -4) + "fake",
  ])
    assert.equal(
      (await api("/api/live?view=patient", "", undefined, credential)).status,
      401,
    );
  assert.equal(
    (await api("/api/live?view=doctor", `medspace_session=${staffValue}`))
      .status,
    401,
  );
  assert.equal(
    (await command("settings", { averageMinutes: 10 }, staffCookie)).status,
    403,
  );
  assert.equal(
    (
      await command(
        "check_in",
        { patientId: first.id },
        doctorCookie,
        randomUUID(),
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await api(
        "/api/live",
        doctorCookie,
        { commandId: randomUUID(), kind: "settings", paused: true },
        undefined,
        { Origin: "https://attacker.invalid" },
      )
    ).status,
    403,
  );
  pass(
    "anonymous, expired, wrong-kind, role-swapped and cross-origin queue requests fail closed",
  );

  const { chromium } = await import(
    process.env.MEDSPACE_PLAYWRIGHT_MODULE || "playwright"
  );
  const realBrowser = await chromium.launch({
    headless: true,
    executablePath:
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    args: [
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  browser = realBrowser;
  const doctorContext = await realBrowser.newContext({
    viewport: { width: 1440, height: 1000 },
    permissions: ["microphone"],
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: bypass,
  });
  const staffContext = await realBrowser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: bypass,
  });
  const patientContext = await realBrowser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Kolkata",
    extraHTTPHeaders: bypass,
  });
  // Synthetic Web Audio input avoids OS microphone prompts and captures no person.
  // MediaRecorder, upload parsing and patient playback still run in the real browser.
  await doctorContext.addInitScript({
    content: String.raw`
    const syntheticStreams=[];
    window.syntheticAudioStreams=syntheticStreams;
    Object.defineProperty(navigator.mediaDevices,"getUserMedia",{configurable:true,writable:true,value:async()=>{
      const context=new AudioContext();await context.resume();
      const oscillator=context.createOscillator(),gain=context.createGain(),destination=context.createMediaStreamDestination();
      oscillator.frequency.value=440;gain.gain.value=.025;oscillator.connect(gain).connect(destination);oscillator.start();
      syntheticStreams.push(destination.stream);
      for(const track of destination.stream.getTracks()){
        const originalStop=track.stop.bind(track);let stopped=false;
        track.stop=()=>{if(stopped)return;stopped=true;originalStop();oscillator.stop();void context.close();};
      }
      return destination.stream;
    }});
  `,
  });
  await doctorContext.addCookies([
    { name: "medspace_session", value: doctorValue, url: base.origin },
  ]);
  await staffContext.addCookies([
    { name: "medspace_staff", value: staffValue, url: base.origin },
  ]);
  const doctorPage = await doctorContext.newPage(),
    staffPage = await staffContext.newPage(),
    patientPage = await patientContext.newPage();
  for (const page of [doctorPage, staffPage, patientPage]) {
    page.setDefaultTimeout(15000);
    page.on("pageerror", (error: Error) =>
      errors.push(error.stack || error.message),
    );
    page.on(
      "dialog",
      (dialog: { accept(): Promise<void> }) => void dialog.accept(),
    );
  }
  await Promise.all([
    doctorPage.goto(base.href),
    staffPage.goto(new URL("/queue", base).href),
    patientPage.goto(new URL(`/p/${token}`, base).href),
  ]);
  for (const page of [doctorPage, staffPage])
    await page
      .getByRole("heading", { name: "Live queue", exact: true })
      .waitFor();
  await patientPage.getByText("You’re checked in", { exact: true }).waitFor();
  await patientPage.getByText("Not set yet", { exact: true }).waitFor();
  pass(
    "doctor, reception and patient pages are open together with a private queue and no invented ETA",
  );
  const staffTicketRow = staffPage
    .locator("ol > li")
    .filter({ has: staffPage.getByText(first.name, { exact: true }) });
  await staffTicketRow
    .getByRole("button", { name: "Share queue link", exact: true })
    .click();
  await staffTicketRow.getByAltText("Patient queue ticket QR code").waitFor();
  const queueUrl = await staffTicketRow
      .getByLabel("Patient queue link", { exact: true })
      .inputValue(),
    queueToken = new URL(queueUrl).pathname.slice(3);
  const ticketState = await api("/api/live/ticket", "", undefined, queueToken);
  assert.equal(ticketState.status, 200);
  const ticketJson = await ticketState.json();
  assert(!("entries" in ticketJson));
  assert(!("photoRequests" in ticketJson));
  assert(!("messages" in ticketJson));
  assert.equal(
    (await api("/api/live?view=patient", "", undefined, queueToken)).status,
    401,
  );
  assert.equal(
    (await api("/api/live/ticket", "", undefined, token)).status,
    401,
  );
  const forbiddenPlan = await api(`/p/${queueToken}`, "");
  const forbiddenHtml = await forbiddenPlan.text();
  assert(
    forbiddenHtml.includes("This page could not be found") ||
      forbiddenHtml.includes("NEXT_HTTP_ERROR_FALLBACK;404"),
  );
  assert(!forbiddenHtml.includes(first.name));
  await patientPage.goto(queueUrl);
  await patientPage
    .getByRole("heading", { name: "Your queue ticket", exact: true })
    .waitFor();
  await patientPage.getByText("You’re checked in", { exact: true }).waitFor();
  assert.equal(
    await patientPage
      .getByText("Three questions before your visit", { exact: true })
      .count(),
    0,
  );
  await patientPage.goto(new URL(`/p/${token}`, base).href);
  pass(
    "reception shares a private QR/ticket that opens the live queue and cannot become a clinical care-plan credential",
  );
  await staffPage
    .getByLabel("Find by name, phone or file number")
    .fill(second.name);
  await staffPage
    .getByRole("button", { name: new RegExp(second.name) })
    .click();
  await doctorPage.getByText(second.name, { exact: true }).waitFor();
  await staffPage
    .getByLabel("Find by name, phone or file number")
    .fill("9876543210");
  await staffPage
    .getByRole("button", { name: new RegExp(first.name) })
    .waitFor();
  assert.equal(
    await db.queueEntry.count({
      where: { patientId: first.id, status: "waiting" },
    }),
    1,
  );
  pass(
    "staff name and full-phone search check in an existing patient and update the doctor live",
  );
  await doctorPage.getByText(/Queue settings/).click();
  await doctorPage.getByLabel("Average consultation time (minutes)").fill("10");
  await doctorPage
    .getByRole("button", { name: "Save average", exact: true })
    .click();
  await patientPage.getByText("You’re next", { exact: true }).waitFor();
  await doctorPage
    .getByRole("button", { name: "Pause queue", exact: true })
    .click();
  await patientPage.getByText("Queue paused", { exact: true }).waitFor();
  await doctorPage
    .getByRole("button", { name: "Resume queue", exact: true })
    .click();
  await patientPage.getByText("You’re next", { exact: true }).waitFor();
  pass(
    "doctor average and pause/resume propagate live and withdraw paused estimates",
  );

  const duplicate = await command(
    "register",
    { name: "SYNTHETIC shared phone", phone: "9876543210" },
    staffCookie,
  );
  assert.equal(duplicate.status, 409);
  assert.equal((await duplicate.json()).code, "phone_exists");
  await staffPage
    .getByRole("button", { name: "New patient", exact: true })
    .click();
  await staffPage
    .getByLabel("Patient name", { exact: true })
    .fill("SYNTHETIC browser registration");
  await staffPage.getByLabel("Age (optional)", { exact: true }).fill("22");
  await staffPage
    .getByRole("button", { name: "Register & check in", exact: true })
    .click();
  await staffPage
    .getByText(
      "Registered and checked in. Their queue number is shown below.",
      { exact: true },
    )
    .waitFor();
  const registered = await db.patient.findFirstOrThrow({
    where: { name: "SYNTHETIC browser registration" },
  });
  patients.push(registered.id);
  pass(
    "new registration creates one patient/arrival, while a reused phone requires an explicit family-member check",
  );

  const staffVitalsRow = staffPage
    .locator("ol > li")
    .filter({ has: staffPage.getByText(first.name, { exact: true }) });
  await staffVitalsRow.getByRole("button", { name: /Vitals pending/ }).click();
  await staffVitalsRow.getByLabel("Sys", { exact: true }).fill("110");
  const firstRow = doctorPage
    .getByRole("listitem")
    .filter({ has: doctorPage.getByText(first.name, { exact: true }) });
  await firstRow.getByRole("button", { name: /Vitals pending/ }).click();
  await firstRow.getByLabel("Sys", { exact: true }).fill("120");
  await firstRow.getByLabel("Dia", { exact: true }).fill("80");
  await firstRow
    .getByRole("button", { name: "Save vitals", exact: true })
    .click();
  await firstRow.getByText(/Ready · BP 120\/80/).waitFor();
  await staffVitalsRow
    .getByRole("button", { name: "Save vitals", exact: true })
    .click();
  await staffVitalsRow
    .getByText(
      "Could not save. Check that the patient is still waiting, then try again.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    (
      await db.queueEntry.findFirstOrThrow({
        where: { patientId: first.id, status: "waiting" },
      })
    ).bpSys,
    120,
  );
  await staffVitalsRow
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  pass(
    "simultaneous staff and doctor vital edits reject the stale overwrite and preserve the saved measurements",
  );
  await firstRow
    .getByRole("button", { name: "Call patient", exact: true })
    .click();
  await patientPage
    .getByText("The doctor has called you", { exact: true })
    .waitFor();
  await doctorPage
    .getByRole("button", { name: "Start consultation", exact: true })
    .click();
  await patientPage
    .getByText("You’re with the doctor", { exact: true })
    .waitFor();
  const beforeAudio = await db.queueEntry.findFirstOrThrow({
    where: { patientId: first.id, status: "in_consultation" },
  });
  await doctorPage
    .getByRole("link", { name: "Open consultation", exact: true })
    .click();
  await doctorPage
    .getByRole("button", { name: "Record message", exact: true })
    .waitFor();
  assert.equal(
    await doctorPage.getByPlaceholder("Sys", { exact: true }).inputValue(),
    "120",
  );
  pass(
    "vitals, call and start reach all roles; consultation opens with the saved measurements",
  );
  const secondState = await api(
    "/api/live?view=patient",
    "",
    undefined,
    secondToken,
  );
  const secondQueue = await secondState.json();
  assert.equal(secondQueue.patientQueue.position, 2);
  assert.equal(secondQueue.patientQueue.estimateMinutes, 15);
  assert(!JSON.stringify(secondQueue).includes(first.name));
  assert(!secondQueue.entries);
  const wrongOwnerAudio = new FormData();
  wrongOwnerAudio.set("patientId", second.id);
  wrongOwnerAudio.set("commandId", randomUUID());
  wrongOwnerAudio.set("durationMs", "1200");
  wrongOwnerAudio.set("share", "yes");
  wrongOwnerAudio.set(
    "files",
    new File(
      [await readFile("scripts/fixtures/synthetic-doctor-message.webm")],
      "message.webm",
      { type: "audio/webm" },
    ),
  );
  assert.equal(
    (await multipart("/api/live/audio", wrongOwnerAudio)).status,
    409,
  );
  pass(
    "the next patient receives a buffered ETA without another identity, and audio cannot target a different active patient",
  );

  // Real network interruption: confident ETA disappears and focus/online recovers it.
  await patientPage.goto(new URL(`/p/${secondToken}`, base).href);
  await patientPage.getByText("About 15 min", { exact: true }).waitFor();
  await patientContext.setOffline(true);
  await patientPage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await patientPage
    .getByText(
      "Connection interrupted. The last saved position may be out of date.",
      { exact: true },
    )
    .waitFor();
  await patientPage.getByText("Updating…", { exact: true }).waitFor();
  await patientContext.setOffline(false);
  await patientPage.evaluate(() => window.dispatchEvent(new Event("online")));
  await patientPage
    .getByText("Updates every few seconds while this page is open.", {
      exact: true,
    })
    .waitFor();
  pass(
    "offline patient state is visibly stale and reconnect refreshes the authoritative state",
  );
  await patientPage.getByText("About 15 min", { exact: true }).waitFor();
  await patientPage.goto(new URL(`/p/${token}`, base).href);
  await doctorPage.evaluate(
    `window.savedSyntheticMicrophone=navigator.mediaDevices.getUserMedia; navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('Synthetic denied','NotAllowedError')}`,
  );
  await doctorPage
    .getByRole("button", { name: "Record message", exact: true })
    .click();
  await doctorPage
    .getByText(
      "Microphone access was not allowed. Enable it for this doctor page and try again.",
      { exact: true },
    )
    .waitFor();
  await doctorPage.evaluate(
    `navigator.mediaDevices.getUserMedia=()=>new Promise(()=>{})`,
  );
  await doctorPage
    .getByRole("button", { name: "Record message", exact: true })
    .click();
  await doctorPage
    .getByRole("button", { name: "Cancel microphone request", exact: true })
    .click();
  await doctorPage.evaluate(
    `navigator.mediaDevices.getUserMedia=window.savedSyntheticMicrophone`,
  );
  pass(
    "microphone denial has a recovery message and an unanswered permission request can be cancelled",
  );
  await doctorPage
    .getByRole("button", { name: "Record message", exact: true })
    .click();
  await doctorPage
    .getByRole("button", { name: "Stop recording", exact: true })
    .waitFor()
    .catch(async (error: Error) => {
      console.log(
        "RECORDER DIAGNOSTIC",
        await doctorPage.getByRole("alert").allTextContents(),
        await doctorPage.evaluate(() => ({
          secure: isSecureContext,
          media: !!navigator.mediaDevices,
          policy: (
            document as unknown as {
              featurePolicy?: { allowsFeature(name: string): boolean };
            }
          ).featurePolicy?.allowsFeature("microphone"),
        })),
      );
      await doctorPage.screenshot({
        path: resolve(output, "recording-failure.png"),
        fullPage: true,
      });
      throw error;
    });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  await doctorPage
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await doctorPage.getByLabel("Preview your recording").waitFor();
  assert.equal(await db.careMedia.count({ where: { patientId: first.id } }), 0);
  await doctorPage
    .getByRole("button", { name: "Discard recording", exact: true })
    .click();
  assert.equal(
    await doctorPage.getByLabel("Preview your recording").count(),
    0,
  );
  await doctorPage
    .getByRole("button", { name: "Record message", exact: true })
    .click();
  await doctorPage
    .getByRole("button", { name: "Stop recording", exact: true })
    .waitFor()
    .catch(async (error: Error) => {
      console.log(
        "RECORDER DIAGNOSTIC",
        await doctorPage.getByRole("alert").allTextContents(),
        await doctorPage.evaluate(() => ({
          secure: isSecureContext,
          media: !!navigator.mediaDevices,
          policy: (
            document as unknown as {
              featurePolicy?: { allowsFeature(name: string): boolean };
            }
          ).featurePolicy?.allowsFeature("microphone"),
        })),
      );
      await doctorPage.screenshot({
        path: resolve(output, "recording-failure.png"),
        fullPage: true,
      });
      throw error;
    });
  await new Promise((resolve) => setTimeout(resolve, 1400));
  await doctorPage
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await doctorPage.getByLabel("Preview your recording").waitFor();
  const audioResponse = doctorPage.waitForResponse(
    (response: { url(): string; request(): { method(): string } }) =>
      new URL(response.url()).pathname === "/api/live/audio" &&
      response.request().method() === "POST",
  );
  await doctorPage
    .getByRole("button", { name: "Share with patient", exact: true })
    .click();
  const shared = await audioResponse;
  assert.equal(shared.status(), 201, await shared.text());
  await patientPage
    .getByRole("heading", { name: "Messages from your doctor", exact: true })
    .waitFor();
  await patientPage
    .getByRole("button", { name: "Listen to message", exact: true })
    .click();
  await patientPage.getByLabel("Doctor voice message").waitFor();
  await patientPage
    .getByLabel("Doctor voice message")
    .evaluate(async (audio: HTMLAudioElement) => {
      await audio.play();
    });
  await until(
    () =>
      patientPage
        .getByLabel("Doctor voice message")
        .evaluate((audio: HTMLAudioElement) => audio.currentTime > 0.1),
    "patient audio plays",
  );
  pass(
    "real browser recording previews, discards and explicitly shares; patient audio actually plays",
  );
  assert.equal(
    await doctorPage.evaluate(
      `window.syntheticAudioStreams.every(stream=>stream.getTracks().every(track=>track.readyState==='ended'))`,
    ),
    true,
  );
  pass("discarding and sharing stop every synthetic microphone track");
  const media = await db.careMedia.findFirstOrThrow({
    where: { patientId: first.id, kind: "doctor_audio" },
  });
  for (const cookie of ["", staffCookie, `medspace_session=${staffValue}`])
    assert.equal(
      (await api(`/api/live/media/${media.id}`, cookie)).status,
      404,
    );
  assert.equal(
    (
      await api(
        `/api/live/media/${media.id}?view=patient`,
        "",
        undefined,
        secondToken,
      )
    ).status,
    404,
  );
  const ownMedia = await api(
    `/api/live/media/${media.id}?view=patient`,
    "",
    undefined,
    token,
  );
  assert.equal(ownMedia.status, 200);
  assert(ownMedia.headers.get("cache-control")?.includes("no-store"));
  assert(ownMedia.headers.get("content-security-policy")?.includes("sandbox"));
  assert.equal(ownMedia.headers.get("x-content-type-options"), "nosniff");
  pass(
    "shared audio remains private to the owning patient and doctor with sandbox/no-store headers",
  );

  await doctorPage
    .getByPlaceholder("Complaint", { exact: true })
    .fill("SYNTHETIC follow-up demonstration only");
  await doctorPage
    .getByPlaceholder("Advice (diet, activity…)", { exact: true })
    .fill("SYNTHETIC instructions, not clinical advice");
  await doctorPage
    .getByPlaceholder("Add medicine…", { exact: true })
    .fill("SYNTHETIC medicine for browser test");
  await doctorPage
    .getByRole("button", {
      name: "+ Add “SYNTHETIC medicine for browser test”",
      exact: true,
    })
    .click();
  await doctorPage.getByRole("button", { name: "1-0-1", exact: true }).click();
  await doctorPage.getByRole("button", { name: "5d", exact: true }).click();
  await doctorPage
    .getByText("Edit dose and instructions", { exact: true })
    .click();
  await doctorPage
    .getByLabel("Instructions for SYNTHETIC medicine for browser test", {
      exact: true,
    })
    .fill("SYNTHETIC interface demonstration only");
  await doctorPage.getByRole("button", { name: "1 wk", exact: true }).click();
  await doctorPage
    .getByRole("checkbox", {
      name: "Request progress photos before this follow-up",
      exact: true,
    })
    .check();
  await doctorPage
    .getByLabel("Photo instructions", { exact: true })
    .fill("SYNTHETIC photograph for follow-up; use the test image only");
  const visitRequest = doctorPage.waitForRequest(
    (request: { url(): string; method(): string }) =>
      new URL(request.url()).pathname === `/patients/${first.id}/visit/new` &&
      request.method() === "POST",
  );
  await doctorPage
    .getByRole("button", { name: "Save visit & prescription", exact: true })
    .click();
  const capturedVisit = await visitRequest;
  await until(
    async () =>
      (await db.visit.count({ where: { patientId: first.id } })) === 1,
    "visit saved",
  );
  await patientPage
    .getByText("Your visit is complete", { exact: true })
    .waitFor();
  await patientPage
    .getByText("SYNTHETIC medicine for browser test", { exact: true })
    .waitFor();
  await patientPage
    .getByText("SYNTHETIC instructions, not clinical advice", { exact: true })
    .waitFor();
  pass(
    "the patient receives the new prescription and advice on the already-open care page without reloading",
  );
  await patientPage
    .getByRole("heading", {
      name: "Progress photos for your follow-up",
      exact: true,
    })
    .waitFor();
  await staffPage
    .getByText(first.name, { exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    (await db.queueEntry.findUniqueOrThrow({ where: { id: beforeAudio.id } }))
      .status,
    "completed",
  );
  const photoRequest = await db.progressPhotoRequest.findFirstOrThrow({
    where: { patientId: first.id },
  });
  assert(photoRequest.taskId);
  assert.equal(
    await db.carePlanTask.count({
      where: { patientId: first.id, kind: "FOLLOW_UP", status: "pending" },
    }),
    1,
  );
  // Replay the exact committed Server Action, modelling a lost successful response.
  const capturedHeaders = capturedVisit.headers();
  const replayHeaders = Object.fromEntries(
    Object.entries(capturedHeaders).filter(
      ([name]) =>
        ![
          "host",
          "cookie",
          "origin",
          "content-length",
          "connection",
          "accept-encoding",
        ].includes(name),
    ),
  );
  const replay = await fetch(new URL(`/patients/${first.id}/visit/new`, base), {
    method: "POST",
    redirect: "manual",
    body: capturedVisit.postDataBuffer(),
    headers: {
      ...bypass,
      ...(replayHeaders as Record<string, string>),
      Origin: base.origin,
      Cookie: doctorCookie,
    },
  });
  await replay.text();
  assert.equal(await db.visit.count({ where: { patientId: first.id } }), 1);
  assert.equal(
    await db.progressPhotoRequest.count({ where: { patientId: first.id } }),
    1,
  );
  pass(
    "visit completion, queue advancement and assigned follow-up photos commit together and survive exact action replay without duplicates",
  );

  const image = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "white" },
  })
    .png()
    .toBuffer();
  await patientPage
    .getByLabel("Add progress photos", { exact: true })
    .setInputFiles({
      name: "synthetic-progress.png",
      mimeType: "image/png",
      buffer: image,
    });
  await patientPage
    .getByRole("checkbox", {
      name: "These are my progress photos and I want the doctor to review them.",
      exact: true,
    })
    .check();
  await patientPage
    .getByRole("button", { name: "Send progress photos", exact: true })
    .click();
  await patientPage
    .getByText("Photos received. They are waiting for the doctor to review.", {
      exact: true,
    })
    .waitFor();
  await patientPage
    .getByRole("button", { name: "View progress photo", exact: true })
    .click();
  await patientPage.getByAltText("Patient-reported progress photo").waitFor();
  const photo = await db.careMedia.findFirstOrThrow({
    where: { patientId: first.id, kind: "progress_photo" },
  });
  assert.equal((await sharp(photo.data).metadata()).format, "webp");
  assert.equal((await sharp(photo.data).metadata()).exif, undefined);
  await doctorPage.goto(
    new URL(`/patients/${first.id}#progress-photos`, base).href,
  );
  await doctorPage
    .getByRole("button", { name: "View progress photo", exact: true })
    .click();
  await doctorPage.getByAltText("Patient-reported progress photo").waitFor();
  await doctorPage
    .getByRole("button", { name: "Mark photo reviewed", exact: true })
    .click();
  await patientPage
    .getByText("Reviewed by the doctor", { exact: true })
    .waitFor();
  assert.equal(await db.condition.count({ where: { patientId: first.id } }), 0);
  pass(
    "assigned progress photos upload, are rewritten without EXIF, render privately and show live doctor review without creating chart findings",
  );
  const assessmentForm = new FormData();
  assessmentForm.set("concern", "SYNTHETIC live chart refresh");
  assessmentForm.set("duration", "Synthetic timing only");
  assessmentForm.set("context", "Synthetic context only");
  assessmentForm.set("consent", "yes");
  const liveIntake = await fetch(new URL("/api/patient/assessment", base), {
    method: "POST",
    body: assessmentForm,
    headers: {
      ...bypass,
      Origin: base.origin,
      Authorization: `Bearer ${token}`,
      "Idempotency-Key": randomUUID(),
    },
  });
  assert.equal(liveIntake.status, 201);
  await doctorPage
    .getByText("SYNTHETIC live chart refresh", { exact: true })
    .waitFor();
  pass(
    "a new patient assessment appears on the already-open doctor chart without a manual refresh",
  );
  function photoForm(bytes = image, id = photoRequest.id, key = randomUUID()) {
    const form = new FormData();
    form.set("requestId", id);
    form.set("commandId", key);
    form.set("consent", "yes");
    form.set(
      "files",
      new File([new Uint8Array(bytes)], "photo.png", { type: "image/png" }),
    );
    return form;
  }
  const key = randomUUID();
  const duplicatePhoto = photoForm(image, photoRequest.id, key);
  const retry = await multipart("/api/live/photos", duplicatePhoto, "", token);
  assert.equal(retry.status, 201);
  assert.equal((await retry.json()).result.duplicatesSkipped, 1);
  assert.equal(
    (await multipart("/api/live/photos", duplicatePhoto, "", token)).status,
    201,
  );
  assert.equal(
    await db.careMedia.count({ where: { requestId: photoRequest.id } }),
    1,
  );
  assert.equal(
    (await multipart("/api/live/photos", photoForm(), "", secondToken)).status,
    404,
  );
  assert.equal(
    (await multipart("/api/live/photos", photoForm(), staffCookie)).status,
    401,
  );
  assert.equal(
    (
      await multipart(
        "/api/live/photos",
        photoForm(Buffer.from("<svg onload='alert(1)'/>")),
        "",
        token,
      )
    ).status,
    415,
  );
  assert.equal(
    (
      await multipart(
        "/api/live/photos",
        photoForm(Buffer.alloc(2 * 1024 * 1024 + 1)),
        "",
        token,
      )
    ).status,
    413,
  );
  const noConsent = photoForm();
  noConsent.delete("consent");
  assert.equal(
    (await multipart("/api/live/photos", noConsent, "", token)).status,
    400,
  );
  const unknown = photoForm();
  unknown.set("patientId", second.id);
  assert.equal(
    (await multipart("/api/live/photos", unknown, "", token)).status,
    400,
  );
  const red = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "red" },
  })
    .png()
    .toBuffer();
  const blue = await sharp({
    create: { width: 32, height: 32, channels: 3, background: "blue" },
  })
    .png()
    .toBuffer();
  for (const bytes of [red, blue])
    assert.equal(
      (await multipart("/api/live/photos", photoForm(bytes), "", token)).status,
      201,
    );
  assert.equal(
    (
      await multipart(
        "/api/live/photos",
        photoForm(
          await sharp({
            create: { width: 32, height: 32, channels: 3, background: "green" },
          })
            .png()
            .toBuffer(),
        ),
        "",
        token,
      )
    ).status,
    409,
  );
  pass(
    "photo ownership, explicit consent, spoof/size rejection, safe retries and the cumulative three-photo cap hold through HTTP",
  );
  await doctorPage
    .getByRole("button", { name: "Stop collecting photos", exact: true })
    .click();
  await patientPage
    .getByText("The doctor has closed this photo request.", { exact: true })
    .waitFor();
  await db.assessmentUploadLimit.deleteMany({ where: { patientId: first.id } });
  assert.equal(
    (await multipart("/api/live/photos", photoForm(), "", token)).status,
    409,
  );
  pass(
    "closing a photo request stops further uploads while preserving received images",
  );

  await doctorPage.goto(base.href);
  await doctorPage.getByText(second.name, { exact: true }).waitFor();
  // Inject a lost response AFTER the actual server accepted a check-in.
  let lost = false,
    cut = false;
  await staffPage.route(
    "**/api/live?view=staff",
    async (route: {
      request(): { method(): string };
      fetch(): Promise<unknown>;
      abort(): Promise<void>;
      continue(): Promise<void>;
    }) => {
      if (!lost && route.request().method() === "POST") {
        lost = true;
        await route.fetch();
        await route.abort();
        cut = true;
      } else await route.continue();
    },
  );
  await staffPage
    .getByLabel("Find by name, phone or file number")
    .fill(first.name);
  await staffPage.getByRole("button", { name: new RegExp(first.name) }).click();
  await until(async () => cut, "injected response was actually lost");
  await staffPage
    .getByRole("button", { name: "Retry unconfirmed action", exact: true })
    .waitFor();
  await staffPage.unroute("**/api/live?view=staff");
  await staffPage
    .getByRole("button", { name: "Retry unconfirmed action", exact: true })
    .click();
  await staffPage
    .getByRole("button", { name: "Retry unconfirmed action", exact: true })
    .waitFor({ state: "detached" });
  assert.equal(
    await db.queueEntry.count({
      where: { patientId: first.id, status: "waiting" },
    }),
    1,
  );
  await patientPage.getByText("You’re checked in", { exact: true }).waitFor();
  const rejoined = await db.queueEntry.findFirstOrThrow({
    where: { patientId: first.id, status: "waiting" },
  });
  assert(rejoined.number! > beforeAudio.number!);
  pass(
    "a committed check-in with a lost response retries once; returning arrivals get a new stable number at the end",
  );

  for (const [name, page] of [
    ["doctor", doctorPage],
    ["staff", staffPage],
    ["patient", patientPage],
  ] as const) {
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      `${name} phone overflow`,
    );
    await page.screenshot({
      path: resolve(output, `${name}-mobile.png`),
      fullPage: true,
    });
  }
  await doctorPage.setViewportSize({ width: 1440, height: 1000 });
  await doctorPage.screenshot({
    path: resolve(output, "doctor-desktop.png"),
    fullPage: true,
  });
  assert.equal(
    await staffPage
      .getByRole("button", { name: "Call patient", exact: true })
      .count(),
    0,
  );
  assert.equal(
    await staffPage
      .getByRole("button", { name: "Record message", exact: true })
      .count(),
    0,
  );
  const staffJson = JSON.stringify(
    await (await api("/api/live?view=staff", staffCookie)).json(),
  );
  assert(!staffJson.includes("instructions"));
  assert(!staffJson.includes("photosToReview"));
  pass(
    "all three phone layouts have no horizontal overflow; reception excludes clinical controls and review content",
  );
  const audioBytes = await readFile(
    "scripts/fixtures/synthetic-doctor-message.webm",
  );
  function audioForm(id = randomUUID(), share = "yes") {
    const value = new FormData();
    value.set("patientId", first.id);
    value.set("commandId", id);
    value.set("durationMs", "1200");
    value.set("share", share);
    value.set(
      "files",
      new File([audioBytes], "message.webm", { type: "audio/webm" }),
    );
    return value;
  }
  assert.equal(
    (await multipart("/api/live/audio", audioForm(), staffCookie)).status,
    403,
  );
  assert.equal(
    (await multipart("/api/live/audio", audioForm(), "", token)).status,
    403,
  );
  assert.equal(
    (await multipart("/api/live/audio", audioForm(randomUUID(), "no"))).status,
    400,
  );
  const audioKey = randomUUID();
  const sent = await multipart("/api/live/audio", audioForm(audioKey));
  assert.equal(sent.status, 201);
  const sentId = (await sent.json()).result.mediaId;
  const resent = await multipart("/api/live/audio", audioForm(audioKey));
  assert.equal(resent.status, 201);
  assert.equal((await resent.json()).result.mediaId, sentId);
  for (let n = 0; n < 4; n++)
    assert.equal((await multipart("/api/live/audio", audioForm())).status, 201);
  assert.equal(
    await db.careMedia.count({
      where: { patientId: first.id, kind: "doctor_audio" },
    }),
    6,
  );
  assert.equal((await multipart("/api/live/audio", audioForm())).status, 429);
  assert.equal(
    (
      await api(
        `/api/live/media/${photo.id}?view=patient`,
        "",
        undefined,
        queueToken,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api(
        `/api/live/media/${photo.id}?view=patient`,
        "",
        undefined,
        secondToken,
      )
    ).status,
    404,
  );
  pass(
    "audio sharing requires the doctor and explicit share, retries one receipt and enforces the six-message daily cap",
  );
  await db.patient.update({
    where: { id: first.id },
    data: { linkVersion: 2 },
  });
  assert.equal(
    (await api("/api/live?view=patient", "", undefined, token)).status,
    401,
  );
  assert.equal(
    (await api("/api/live/ticket", "", undefined, queueToken)).status,
    401,
  );
  assert.equal(
    (
      await api(
        `/api/live/media/${media.id}?view=patient`,
        "",
        undefined,
        token,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await api(
        `/api/live/media/${photo.id}?view=patient`,
        "",
        undefined,
        token,
      )
    ).status,
    404,
  );
  await patientPage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await patientPage
    .getByText("Your access expired. Reopen your care link or sign in again.", {
      exact: true,
    })
    .waitFor();
  assert.equal(
    await patientPage
      .getByRole("heading", { name: "Messages from your doctor", exact: true })
      .count(),
    0,
  );
  pass(
    "patient-link revocation blocks queue and all existing media, and clears the open live panel",
  );
  const cookieContext = await realBrowser.newContext({
    extraHTTPHeaders: bypass,
  });
  await cookieContext.addCookies([
    {
      name: "medspace_patient",
      value: await createPatientSession(second.id, 1),
      url: base.origin,
    },
  ]);
  const cookiePage = await cookieContext.newPage();
  await cookiePage.goto(new URL("/plan", base).href);
  await cookiePage
    .getByRole("heading", { name: "Your place in the queue", exact: true })
    .waitFor();
  pass(
    "returning patient sessions receive the same private live flow without a token in the URL",
  );
  assert.deepEqual(errors, []);
  pass("the bounded simultaneous browser journey has no uncaught page errors");
  await writeFile(
    resolve(output, "results.json"),
    JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        source: hosted
          ? "isolated hosted synthetic deployment"
          : "local production build",
        sourceCommit: process.env.MEDSPACE_LIVE_SOURCE_SHA,
        checks,
        browserErrors: errors,
        syntheticOnly: true,
      },
      null,
      2,
    ),
  );
  console.log(
    `ALL PASS: ${checks.length} simultaneous live-clinic HTTP/browser checks`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await browser?.close();
    if (patients.length)
      await db.patient.deleteMany({ where: { id: { in: patients } } });
    await db.clinicLiveSettings.updateMany({
      where: { id: "clinic" },
      data: { paused: false, averageMinutes: null },
    });
    await db.drug.deleteMany({
      where: { name: "SYNTHETIC medicine for browser test" },
    });
    await db.$disconnect();
  });
