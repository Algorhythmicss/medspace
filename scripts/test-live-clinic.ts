import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { db } from "../src/lib/db";
import { doctorCareMutation } from "../src/lib/live-care-server";
import { saveReport } from "../src/lib/reports";
import { mergePatients } from "../src/lib/merge";
import { doctorAudio } from "../src/lib/care-media";
import { readFile } from "node:fs/promises";
import {
  createQueueToken,
  readQueueToken,
  createPatientToken,
  readPatientLink,
  readBindToken,
  readPatientSessionValue,
} from "../src/lib/patientLink";
import { queueTicketSnapshot } from "../src/lib/queue-ticket";
import {
  ClinicError,
  clinicDay,
  clinicDayStart,
  patientQueue,
  queueOrder,
  type QueueItem,
} from "../src/lib/live-clinic";
import {
  clinicCommand,
  liveSnapshot,
  payloadHash,
  queueMutation,
} from "../src/lib/live-clinic-server";
const url = new URL(process.env.DATABASE_URL || "http://missing.invalid");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "5434");
assert.equal(url.pathname, "/medspace_live_clinic_test");
const ids: string[] = [];
let checks = 0;
function pass(label: string) {
  checks++;
  console.log("PASS " + label);
}
const doctor = { kind: "doctor" as const },
  staff = { kind: "staff" as const };
async function command(
  actor: typeof doctor | typeof staff,
  kind: string,
  value: Record<string, unknown> = {},
  id = randomUUID(),
) {
  return queueMutation(actor, { commandId: id, kind, ...value });
}
function item(
  id: string,
  status: QueueItem["status"],
  at = "2026-11-03T05:00:00Z",
): QueueItem {
  return {
    id,
    patientId: id,
    name: "SYNTHETIC " + id,
    fileNumber: 1,
    ageYears: null,
    sex: null,
    number: 1,
    dayKey: "2026-11-03",
    status,
    arrivedAt: at,
    queuedAt: at,
    calledAt: null,
    startedAt: status === "in_consultation" ? at : null,
    revision: 0,
    vitalsReady: false,
  };
}
async function main() {
  assert.equal(clinicDay(new Date("2026-11-02T18:29:59Z")), "2026-11-02");
  assert.equal(clinicDay(new Date("2026-11-02T18:30:00Z")), "2026-11-03");
  assert.equal(
    clinicDayStart(new Date("2026-11-03T15:00:00Z")).toISOString(),
    "2026-11-02T18:30:00.000Z",
  );
  pass(
    "clinic day changes at Indian midnight, independently of server timezone",
  );
  const entries = queueOrder([
    item("third", "waiting", "2026-11-03T05:02:00Z"),
    item("second", "waiting", "2026-11-03T05:01:00Z"),
    item("first", "in_consultation"),
  ]);
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["first", "second", "third"],
  );
  const settings = { averageMinutes: 10, paused: false },
    now = new Date("2026-11-03T05:00:00Z");
  assert.equal(
    patientQueue(entries, entries[2], settings, now).estimateMinutes,
    30,
  );
  pass(
    "pessimistic ETA includes a buffered slot for everyone ahead and the current consultation",
  );
  assert.equal(
    patientQueue(
      entries,
      entries[2],
      settings,
      new Date("2026-11-03T06:00:00Z"),
    ).estimateMinutes,
    20,
  );
  assert.equal(
    patientQueue(entries, entries[2], { ...settings, paused: true }, now)
      .estimateMinutes,
    null,
  );
  assert.equal(
    patientQueue(
      entries,
      entries[2],
      { averageMinutes: null, paused: false },
      now,
    ).estimateMinutes,
    null,
  );
  pass(
    "overruns keep a nonzero reserve, while paused or unconfigured queues have no ETA",
  );
  assert.equal(patientQueue(entries, null, settings, now).position, null);
  assert.equal(
    patientQueue(
      entries,
      { ...entries[2], id: "completed", status: "completed" },
      settings,
      now,
    ).estimateMinutes,
    null,
  );
  pass(
    "missing and completed arrivals never receive a fabricated position or countdown",
  );
  assert.equal(
    payloadHash({ a: 1, b: { d: 2, c: 3 } }),
    payloadHash({ b: { c: 3, d: 2 }, a: 1 }),
  );
  assert.notEqual(payloadHash({ a: 1 }), payloadHash({ a: 2 }));
  pass("command fingerprints preserve semantic content across JSON key order");
  const maximum =
    (await db.patient.aggregate({ _max: { fileNumber: true } }))._max
      .fileNumber ?? 0;
  for (let index = 0; index < 4; index++) {
    const patient = await db.patient.create({
      data: {
        name: `SYNTHETIC live core ${index}`,
        fileNumber: maximum + index + 1,
      },
    });
    ids.push(patient.id);
  }
  const id = randomUUID(),
    body = { commandId: id, kind: "check_in", patientId: ids[0] };
  const same = await Promise.all([
    queueMutation(staff, body),
    queueMutation(staff, body),
  ]);
  assert.deepEqual(same[0], same[1]);
  assert.equal(
    await db.queueEntry.count({
      where: { patientId: ids[0], status: "waiting" },
    }),
    1,
  );
  pass(
    "concurrent retries with one command ID create exactly one arrival and receipt",
  );
  const firstArrival = await db.queueEntry.findFirstOrThrow({
    where: { patientId: ids[0], status: "waiting" },
  });
  const ticket = await createQueueToken(ids[0], firstArrival.id, 1);
  assert(await readQueueToken(ticket));
  assert.equal(await readPatientLink(ticket), null);
  assert.equal(await readBindToken(ticket), null);
  assert.equal(await readPatientSessionValue(ticket), null);
  assert.equal(await readQueueToken(await createPatientToken(ids[0])), null);
  const ticketView = await queueTicketSnapshot(ticket);
  assert(!Object.hasOwn(ticketView, "entries"));
  assert(!Object.hasOwn(ticketView, "photoRequests"));
  assert(!Object.hasOwn(ticketView, "messages"));
  pass(
    "queue credentials cannot become plan, binding or session credentials and their projection excludes clinical care",
  );
  const realNow = Date.now;
  let expiredTicket: string;
  try {
    Date.now = () => realNow() - 2 * 86400000;
    expiredTicket = await createQueueToken(ids[0], firstArrival.id, 1);
  } finally {
    Date.now = realNow;
  }
  assert.equal(await readQueueToken(expiredTicket), null);
  assert.equal(await readQueueToken(ticket.slice(0, -3) + "bad"), null);
  pass("queue tickets expire after 24 hours and reject forged signatures");
  await assert.rejects(
    () => queueMutation(staff, { ...body, patientId: ids[1] }),
    (error: unknown) =>
      error instanceof ClinicError && error.code === "command_conflict",
  );
  pass("a retry with changed patient content cannot reuse a committed receipt");
  await Promise.all([
    command(staff, "check_in", { patientId: ids[1] }),
    command(staff, "check_in", { patientId: ids[1] }),
  ]);
  assert.equal(
    await db.queueEntry.count({
      where: { patientId: ids[1], status: "waiting" },
    }),
    1,
  );
  pass(
    "two staff check-ins with different IDs still preserve one active arrival per patient",
  );
  const registration = randomUUID(),
    registrationBody = {
      commandId: registration,
      kind: "register",
      name: "SYNTHETIC retry registration",
      ageYears: "30",
      phone: "",
      sex: "",
    };
  const registered = await Promise.all([
    queueMutation(staff, registrationBody),
    queueMutation(staff, registrationBody),
  ]);
  const registeredId = (registered[0] as { patientId: string }).patientId;
  ids.push(registeredId);
  assert.deepEqual(registered[0], registered[1]);
  assert.equal(await db.patient.count({ where: { id: registeredId } }), 1);
  pass(
    "lost-response registration retries return one patient and one daily number",
  );
  await assert.rejects(
    () => command(staff, "settings", { averageMinutes: 10 }),
    (error: unknown) => error instanceof ClinicError && error.status === 403,
  );
  await assert.rejects(
    () => command(doctor, "settings", { averageMinutes: 0 }),
    (error: unknown) => error instanceof ClinicError && error.status === 400,
  );
  await command(doctor, "settings", { averageMinutes: 10, paused: false });
  pass("only the doctor can set a bounded consultation average or pause state");
  const waiting = await db.queueEntry.findMany({
    where: { patientId: { in: ids }, status: "waiting" },
    orderBy: { number: "asc" },
  });
  assert(
    waiting.every(
      (entry, index) =>
        index === 0 || entry.number! > waiting[index - 1].number!,
    ),
  );
  const races = await Promise.allSettled(
    waiting.slice(0, 2).map((entry) =>
      command(doctor, "call", {
        entryId: entry.id,
        revision: entry.revision,
      }),
    ),
  );
  assert.equal(
    races.filter((result) => result.status === "fulfilled").length,
    1,
  );
  assert.equal(
    await db.queueEntry.count({
      where: { status: { in: ["called", "in_consultation"] } },
    }),
    1,
  );
  pass(
    "concurrent doctor calls cannot occupy the single consultation slot twice",
  );
  const active = await db.queueEntry.findFirstOrThrow({
    where: { status: "called" },
  });
  await assert.rejects(
    () =>
      command(staff, "cancel", {
        entryId: active.id,
        revision: active.revision,
      }),
    (error: unknown) => error instanceof ClinicError && error.status === 403,
  );
  await assert.rejects(
    () =>
      command(doctor, "start", {
        entryId: active.id,
        revision: active.revision - 1,
      }),
    (error: unknown) => error instanceof ClinicError && error.code === "stale",
  );
  pass(
    "staff cannot end a called patient, and stale doctor actions are rejected",
  );
  await command(doctor, "start", {
    entryId: active.id,
    revision: active.revision,
  });
  const consulting = await db.queueEntry.findUniqueOrThrow({
    where: { id: active.id },
  });
  await command(doctor, "return", {
    entryId: consulting.id,
    revision: consulting.revision,
  });
  const returned = await db.queueEntry.findUniqueOrThrow({
    where: { id: active.id },
  });
  assert.equal(returned.number, active.number);
  assert.equal(returned.status, "waiting");
  assert.equal(returned.startedAt, null);
  pass(
    "returning to waiting preserves the daily number and releases the doctor slot",
  );
  const state = await liveSnapshot({
    kind: "patient",
    patientId: ids[0],
    version: 1,
  });
  const privateJson = JSON.stringify(state);
  assert(!Object.hasOwn(state, "entries"));
  assert(!privateJson.includes("SYNTHETIC live core 1"));
  assert(state.patientQueue?.position);
  pass(
    "patient snapshots contain only their own arrival and aggregate queue position",
  );
  const staffState = await liveSnapshot(staff);
  assert(
    staffState.entries?.every(
      (entry) =>
        entry.assessmentsToReview === undefined &&
        entry.photosToReview === undefined,
    ),
  );
  pass("staff snapshots exclude clinical review counts and care media");
  await db.patient.update({ where: { id: ids[0] }, data: { linkVersion: 2 } });
  await assert.rejects(
    () => liveSnapshot({ kind: "patient", patientId: ids[0], version: 1 }),
    (error: unknown) => error instanceof ClinicError && error.status === 401,
  );
  pass("revoked patient links cannot read live state");
  const marker = randomUUID();
  await assert.rejects(() =>
    clinicCommand(doctor, marker, "rollback_test", {}, async (tx) => {
      await tx.queueEntry.create({
        data: {
          patientId: ids[3],
          status: "waiting",
          dayKey: clinicDay(),
          number: 99999,
        },
      });
      throw new Error("injected rollback");
    }),
  );
  assert.equal(await db.liveCommandReceipt.count({ where: { id: marker } }), 0);
  assert.equal(await db.queueEntry.count({ where: { patientId: ids[3] } }), 0);
  pass("partial failures roll back both queue writes and command receipts");
  await command(staff, "check_in", { patientId: ids[2] });
  const yesterday = new Date(Date.now() - 86400000);
  const midnight = await db.queueEntry.findFirstOrThrow({
    where: { patientId: ids[2], status: "waiting" },
  });
  await db.queueEntry.update({
    where: { id: midnight.id },
    data: {
      dayKey: clinicDay(yesterday),
      arrivedAt: yesterday,
      queuedAt: yesterday,
      status: "called",
    },
  });
  await command(doctor, "start", {
    entryId: midnight.id,
    revision: midnight.revision,
  });
  const overnight = await db.queueEntry.findUniqueOrThrow({
    where: { id: midnight.id },
  });
  assert.equal(overnight.status, "in_consultation");
  await command(doctor, "return", {
    entryId: overnight.id,
    revision: overnight.revision,
  });
  const today = await db.queueEntry.findFirstOrThrow({
    where: { patientId: ids[2], status: "waiting", dayKey: clinicDay() },
  });
  assert.notEqual(today.id, midnight.id);
  assert(today.number);
  assert.equal(
    (await db.queueEntry.findUniqueOrThrow({ where: { id: midnight.id } }))
      .status,
    "cancelled",
  );
  pass(
    "a called patient can start after midnight and returning creates a visible arrival for the new day",
  );
  const legacy = await db.queueEntry.create({
    data: {
      patientId: ids[3],
      status: "waiting",
      arrivedAt: new Date(Date.now() - 60000),
    },
  });
  const legacyState = await liveSnapshot(doctor);
  assert(
    legacyState.entries?.some(
      (entry) => entry.id === legacy.id && entry.number === null,
    ),
  );
  await command(staff, "check_in", { patientId: ids[3] });
  await db.queueEntry.update({
    where: { id: legacy.id },
    data: { arrivedAt: new Date(clinicDayStart().getTime() + 3600000) },
  });
  const history = await saveReport({
    patientId: ids[3],
    source: "staff",
    title: "SYNTHETIC Indian-midnight history",
    kind: "other",
    reportDate: new Date(),
    values: [],
  });
  assert.equal(history.reviewStatus, "pending");
  pass(
    "staff history uses the Indian clinic day, including arrivals before UTC midnight",
  );
  const adopted = await db.queueEntry.findUniqueOrThrow({
    where: { id: legacy.id },
  });
  assert(adopted.number);
  assert.equal(adopted.dayKey, clinicDay());
  pass(
    "today's legacy waiting arrival stays visible and receives its number without a second arrival",
  );
  await assert.rejects(() =>
    db.queueEntry.create({
      data: {
        patientId: ids[0],
        status: "waiting",
        dayKey: clinicDay(),
        number: today.number,
      },
    }),
  );
  await assert.rejects(() =>
    db.queueEntry.create({
      data: {
        patientId: ids[3],
        status: "waiting",
        dayKey: clinicDay(),
        number: 99998,
      },
    }),
  );
  pass(
    "database unique indexes independently reject duplicate daily numbers and active patient arrivals",
  );
  const audio = await readFile(
    "scripts/fixtures/synthetic-doctor-message.webm",
  );
  const parsed = await doctorAudio(
    new File([audio], "message.webm", { type: "audio/webm" }),
    1200,
  );
  assert.equal(parsed.mime, "audio/webm");
  assert(parsed.durationMs > 0);
  for (const [bytes, mime, duration] of [
    [Buffer.from("<svg/>"), "audio/webm", 1200],
    [audio, "audio/mp4", 1200],
    [audio, "audio/webm", 120000],
    [Buffer.alloc(2097153), "audio/webm", 1200],
  ] as const)
    await assert.rejects(() =>
      doctorAudio(new File([bytes], "invalid.webm", { type: mime }), duration),
    );
  pass(
    "audio uses parsed duration and rejects spoofed types, false timers and oversized recordings",
  );
  const task = await db.carePlanTask.create({
    data: {
      patientId: ids[3],
      kind: "FOLLOW_UP",
      title: "SYNTHETIC merge follow-up",
    },
  });
  const assignment = {
    commandId: randomUUID(),
    kind: "assign_photos",
    taskId: task.id,
    instructions: "SYNTHETIC merge evidence",
  };
  await assert.rejects(
    () => doctorCareMutation(staff, ids[3], assignment),
    (error: unknown) => error instanceof ClinicError && error.status === 403,
  );
  await assert.rejects(
    () => doctorCareMutation(doctor, ids[2], assignment),
    (error: unknown) => error instanceof ClinicError && error.status === 409,
  );
  const assigned = await doctorCareMutation(doctor, ids[3], assignment);
  const assignedRetry = await doctorCareMutation(doctor, ids[3], assignment);
  assert.deepEqual(assigned, assignedRetry);
  const request = await db.progressPhotoRequest.findUniqueOrThrow({
    where: { taskId: task.id },
  });
  await assert.rejects(
    () =>
      doctorCareMutation(doctor, ids[3], {
        ...assignment,
        commandId: randomUUID(),
      }),
    (error: unknown) => error instanceof ClinicError && error.status === 409,
  );
  pass(
    "existing follow-up photo assignment is doctor-only, patient-bound and idempotent with one request per follow-up",
  );
  const voice = await db.careMedia.create({
    data: {
      patientId: ids[3],
      queueEntryId: adopted.id,
      kind: "doctor_audio",
      name: parsed.name,
      mime: parsed.mime,
      size: parsed.size,
      sha256: parsed.hash,
      data: parsed.data,
      durationMs: parsed.durationMs,
      sharedAt: new Date(),
    },
  });
  const idsBefore = await db.queueEntry.findMany({
    where: { patientId: { in: [ids[2], ids[3]] } },
    select: { id: true, number: true },
  });
  await mergePatients(ids[2], ids[3]);
  assert.equal(
    (await db.careMedia.findUniqueOrThrow({ where: { id: voice.id } }))
      .patientId,
    ids[2],
  );
  assert.equal(
    (
      await db.progressPhotoRequest.findUniqueOrThrow({
        where: { id: request.id },
      })
    ).patientId,
    ids[2],
  );
  for (const before of idsBefore)
    assert.equal(
      (await db.queueEntry.findUniqueOrThrow({ where: { id: before.id } }))
        .number,
      before.number,
    );
  assert.equal(
    await db.queueEntry.count({
      where: { patientId: ids[2], dayKey: clinicDay(), status: "waiting" },
    }),
    1,
  );
  assert.equal(await db.patient.count({ where: { id: ids[3] } }), 0);
  pass(
    "merging records preserves new media, follow-up requests and ticket history while collapsing active duplicates",
  );
  process.env.MEDSPACE_LIVE_CLINIC_ENABLED = "false";
  try {
    await mergePatients(ids[1], ids[2]);
  } finally {
    process.env.MEDSPACE_LIVE_CLINIC_ENABLED = "true";
  }
  assert.equal(
    (await db.careMedia.findUniqueOrThrow({ where: { id: voice.id } }))
      .patientId,
    ids[1],
  );
  assert.equal(
    (
      await db.progressPhotoRequest.findUniqueOrThrow({
        where: { id: request.id },
      })
    ).patientId,
    ids[1],
  );
  pass(
    "disabling the live UI never allows a later merge to discard previously collected care media",
  );
  const posture = await db.$queryRaw<
    Array<{ tablename: string; rowsecurity: boolean }>
  >`SELECT tablename,rowsecurity FROM pg_tables WHERE schemaname='public' AND tablename IN ('ClinicLiveSettings','ClinicQueueDay','LiveCommandReceipt','ProgressPhotoRequest','CareMedia')`;
  assert.equal(posture.length, 5);
  assert(posture.every((table) => table.rowsecurity));
  pass("all five new private tables have deny-all RLS enabled");
  console.log(`ALL PASS: ${checks} live-clinic core checks`);
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.queueEntry.deleteMany({ where: { patientId: { in: ids } } });
    await db.patient.deleteMany({ where: { id: { in: ids } } });
    await db.clinicLiveSettings.updateMany({
      where: { id: "clinic" },
      data: { paused: false, averageMinutes: null },
    });
    await db.$disconnect();
  });
