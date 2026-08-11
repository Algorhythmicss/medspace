// The two seeds must produce the same demo panel — this is the test that was
// missing when they silently diverged for a week (found + fixed 9 Aug 2026).
//
// `prisma/seed.ts` seeds local dev; `scripts/seed-sql.ts` emits SQL and is the
// path used to load PRODUCTION. When they drift, the drift is invisible: `tsc`
// sees two unrelated files, no other suite reads either, and the app runs fine
// against whichever one you happened to load. The failure only shows up as a
// feature that "doesn't work on prod" — last time, recall, the Hindi plan, the
// reach states and the queue were all missing from the SQL path.
//
// So this compares OUTCOMES, not source text: load the emitted SQL, snapshot the
// panel, run prisma/seed.ts, snapshot again, diff. Anything either seed writes
// and the other doesn't shows up as a field difference.
//
// DB-touching, like test-merge/-report/-supersede: it rewrites the local demo
// panel. It finishes by running prisma/seed.ts, so it leaves the database in
// exactly the canonical dev state — no reseed needed afterwards.
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import "dotenv/config";
import { execFileSync } from "node:child_process";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const db = new PrismaClient({ adapter });

function expect(cond: boolean, label: string) {
  if (!cond) { console.error(`FAIL: ${label}`); process.exitCode = 1; }
  else console.log(`ok: ${label}`);
}

// Every field either seed is capable of writing. Timestamps are compared as
// presence, not value: both seeds date everything relative to their own `now`,
// so the instants legitimately differ by the seconds between the two runs —
// but "did this seed set planFirstOpenedAt at all" is exactly the drift signal.
type Row = Record<string, string | number | boolean | null>;

async function snapshot(): Promise<Row[]> {
  const patients = await db.patient.findMany({
    orderBy: { fileNumber: "asc" },
    include: {
      conditions: { orderBy: { name: "asc" } },
      allergies: { orderBy: { substance: "asc" } },
      observations: true,
      tasks: true,
      reports: true,
      queueEntries: true,
      visits: { include: { prescription: { include: { items: true } } } },
    },
  });

  return patients.map((p) => ({
    fileNumber: p.fileNumber,
    name: p.name,
    phone: p.phone,
    sex: p.sex,
    ageYears: p.ageYears,
    address: p.address,
    stickyNote: p.stickyNote,
    language: p.language,
    linkVersion: p.linkVersion,
    // reach — the block that went missing last time
    planShareCount: p.planShareCount,
    planOpenCount: p.planOpenCount,
    planSharedAt: p.planSharedAt != null,
    planFirstOpenedAt: p.planFirstOpenedAt != null,
    planLastOpenedAt: p.planLastOpenedAt != null,
    planReplyKind: p.planReplyKind,
    planReplyAt: p.planReplyAt != null,
    // shape of the record hanging off the patient
    conditions: p.conditions.map((c) => `${c.name}:${c.status}`).join("|"),
    // condition dates are load-bearing (Geeta's is in days, not whole years),
    // so compare the day offset rather than just the count
    conditionAgeDays: p.conditions
      .map((c) => (c.since ? Math.round((Date.now() - c.since.getTime()) / 86400000) : "-"))
      .join("|"),
    allergies: p.allergies.map((a) => `${a.substance}:${a.reaction ?? ""}`).join("|"),
    visits: p.visits.length,
    visitComplaints: p.visits
      .map((v) => v.complaint ?? "")
      .sort()
      .join("|"),
    visitsWithFollowUp: p.visits.filter((v) => v.followUpDate != null).length,
    rxItems: p.visits.reduce((n, v) => n + (v.prescription?.items.length ?? 0), 0),
    clinicalObs: p.observations.filter((o) => o.source !== "patient").length,
    homeObs: p.observations.filter((o) => o.source === "patient").length,
    homeObsDetail: p.observations
      .filter((o) => o.source === "patient")
      .map((o) => `${o.type}=${o.value}`)
      .sort()
      .join("|"),
    obsWithoutVisit: p.observations.filter((o) => o.visitId == null).length,
    tasks: p.tasks.map((t) => `${t.kind}:${t.title}:${t.status}`).sort().join("|"),
    reports: p.reports.map((r) => `${r.kind}:${r.title}`).sort().join("|"),
    queue: p.queueEntries.map((q) => `${q.status}:${q.note ?? ""}`).sort().join("|"),
  }));
}

async function globals() {
  const clinic = await db.clinic.findFirst();
  const drugs = await db.drug.findMany({ orderBy: { name: "asc" } });
  return {
    clinic: clinic
      ? [clinic.id, clinic.clinicName, clinic.doctorName, clinic.regNumber, clinic.degrees, clinic.phone, clinic.address].join("~")
      : "NONE",
    drugCount: drugs.length,
    drugs: drugs
      .map((d) => `${d.name}/${d.defaultFrequency ?? ""}/${d.defaultDuration ?? ""}/${d.defaultInstructions ?? ""}/${d.useCount}`)
      .join("|"),
  };
}

// Split the emitted script into statements. Must be quote-aware: the wipe is one
// line of many DELETEs, and clinical free text legitimately contains semicolons
// ("T2DM with HTN; ? early peripheral neuropathy"), so a naive split on ";" cuts
// a diagnosis in half and hands Postgres an unterminated string.
function statements(sql: string): string[] {
  const found: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      if (inQuote && sql[i + 1] === "'") { cur += "''"; i++; continue; } // escaped quote
      inQuote = !inQuote;
      cur += ch;
      continue;
    }
    if (ch === ";" && !inQuote) { found.push(cur); cur = ""; continue; }
    cur += ch;
  }
  found.push(cur);
  return found.map((s) => s.trim()).filter((s) => s.length > 0 && !s.startsWith("--"));
}

async function main() {
  console.log("loading scripts/seed-sql.ts output …");
  const sql = execFileSync("npx", ["tsx", "scripts/seed-sql.ts"], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  for (const stmt of statements(sql)) await db.$executeRawUnsafe(stmt);
  const fromSql = await snapshot();
  const globalsFromSql = await globals();

  console.log("running prisma/seed.ts …");
  execFileSync("npx", ["tsx", "prisma/seed.ts"], { encoding: "utf8" });
  const fromTs = await snapshot();
  const globalsFromTs = await globals();

  // ---- compare ----
  expect(fromSql.length > 0, "the SQL seed produced a panel at all");
  expect(
    fromSql.length === fromTs.length,
    `same patient count (sql ${fromSql.length}, ts ${fromTs.length})`
  );

  const sqlFiles = fromSql.map((r) => r.fileNumber).join(",");
  const tsFiles = fromTs.map((r) => r.fileNumber).join(",");
  expect(sqlFiles === tsFiles, `same fileNumbers (sql ${sqlFiles} | ts ${tsFiles})`);

  // Field-by-field, so a failure names the patient AND the field that drifted
  // rather than just "the panels differ".
  const fields = Object.keys(fromTs[0] ?? {});
  let mismatches = 0;
  for (const tsRow of fromTs) {
    const sqlRow = fromSql.find((r) => r.fileNumber === tsRow.fileNumber);
    if (!sqlRow) {
      console.error(`FAIL: patient ${tsRow.fileNumber} (${tsRow.name}) missing from the SQL seed`);
      mismatches++;
      continue;
    }
    for (const f of fields) {
      if (String(sqlRow[f]) !== String(tsRow[f])) {
        console.error(
          `FAIL: patient ${tsRow.fileNumber} field "${f}" — sql=${JSON.stringify(sqlRow[f])} ts=${JSON.stringify(tsRow[f])}`
        );
        mismatches++;
      }
    }
  }
  expect(mismatches === 0, `every patient matches field-for-field across ${fields.length} fields`);

  expect(globalsFromSql.clinic === globalsFromTs.clinic, "identical Clinic singleton");
  expect(
    globalsFromSql.drugCount === globalsFromTs.drugCount,
    `same formulary size (sql ${globalsFromSql.drugCount}, ts ${globalsFromTs.drugCount})`
  );
  expect(globalsFromSql.drugs === globalsFromTs.drugs, "identical formulary rows and useCounts");

  // Guard the specific capabilities the drift silently removed last time, so a
  // future deletion fails loudly here even if both seeds are deleted in step.
  const hasDrifter = fromTs.some((r) => r.visits === 1 && Number(r.conditionAgeDays) > 1000);
  expect(hasDrifter, "panel still contains a chronic drifter (exercises /followups recall)");
  expect(fromTs.some((r) => r.language === "hi"), "panel still exercises the Hindi plan");
  expect(fromTs.some((r) => r.planReplyKind === "not_coming"), "panel still exercises a declined follow-up");
  expect(fromTs.some((r) => Number(r.planShareCount) >= 2 && r.planOpenCount === 0), "panel still exercises a silent (call-first) patient");
  expect(fromTs.some((r) => Number(r.planOpenCount) > 0), "panel still exercises an engaged patient");
  expect(fromTs.some((r) => Number(r.homeObs) > 0), "panel still exercises home readings");
  expect(fromTs.some((r) => Number(r.queue) !== 0 || String(r.queue).length > 0), "panel still exercises the front-desk queue");

  console.log(process.exitCode ? "TESTS FAILED" : "ALL PASS");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
