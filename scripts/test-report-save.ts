import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";
import { clinicDayStart } from "../src/lib/live-clinic";
import { AssessmentError } from "../src/lib/assessment";
import { REPORT_METRICS } from "../src/lib/metrics";
import type { SaveReportInput } from "../src/lib/reports";

type Scenario = {
  version?: number;
  pending?: number;
  waiting?: boolean;
  missing?: boolean;
  failObservation?: boolean;
  malware?: boolean;
  mutant?: boolean;
};
function store(scenario: Scenario = {}) {
  const committed: Array<Record<string, unknown>> = [];
  let transactions = 0,
    taskStoreValidated = false;
  let activeClient: unknown;
  const database = {
    observation: {
      createMany: async () => {
        throw new Error("Writes must use the active transaction");
      },
    },
    $transaction: async (body: (client: unknown) => Promise<unknown>) => {
      transactions += 1;
      const staged: Array<Record<string, unknown>> = [];
      const client = {
        $queryRaw: async (query: TemplateStringsArray) =>
          query.join("").includes('"QueueEntry"')
            ? scenario.waiting
              ? [{ id: "synthetic-queue" }]
              : []
            : scenario.missing
              ? []
              : [
                  {
                    id: "synthetic-patient",
                    linkVersion: scenario.version ?? 1,
                  },
                ],
        report: {
          count: async () => scenario.pending ?? 0,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            const report = { id: "synthetic-report", ...data };
            staged.push(report);
            return report;
          },
        },
        observation: {
          createMany: async ({ data }: { data: unknown[] }) => {
            if (scenario.failObservation)
              throw new Error("SYNTHETIC observation failure");
            staged.push({ observations: data });
          },
        },
        patient: {
          update: async () => {
            staged.push({ patientUpdated: true });
          },
        },
      };
      activeClient = client;
      const result = await body(client);
      committed.push(...staged);
      return result;
    },
  };
  const sandboxModule = {
    exports: {} as {
      saveReport: (input: SaveReportInput) => Promise<Record<string, unknown>>;
    },
  };
  const source = readFileSync("src/lib/reports.ts", "utf8");
  const output = transpileModule(
    scenario.mutant
      ? source.replace(
          "client.observation.createMany",
          "db.observation.createMany",
        )
      : source,
    {
      compilerOptions: {
        module: ModuleKind.CommonJS,
        target: ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(output, {
    module: sandboxModule,
    exports: sandboxModule.exports,
    Date,
    Map,
    Number,
    require: (name: string) => {
      if (name === "@/lib/live-clinic") return { clinicDayStart };
      if (name === "@/lib/db") return { db: database };
      if (name === "@/lib/metrics") return { REPORT_METRICS };
      if (name === "@/lib/assessment") return { AssessmentError };
      if (name === "@/lib/report-attachments")
        return {
          MAX_REPORT_FILE_BYTES: 4 * 1024 * 1024,
          prepareReportAttachment: async (file: unknown) => {
            if (scenario.malware)
              throw new AssessmentError(
                422,
                "malware",
                "SYNTHETIC rejected attachment",
              );
            return file;
          },
        };
      if (name === "@/lib/tasks")
        return {
          completeMatchingLabTasks: async (
            _patient: unknown,
            _types: unknown,
            _date: unknown,
            client: unknown,
          ) => {
            assert.equal(client, activeClient);
            taskStoreValidated = true;
          },
        };
      throw new Error(`Unexpected report dependency: ${name}`);
    },
  });
  return {
    save: sandboxModule.exports.saveReport,
    committed,
    transactions: () => transactions,
    taskStoreValidated: () => taskStoreValidated,
  };
}

const input: SaveReportInput = {
  patientId: "synthetic-patient",
  title: "SYNTHETIC report",
  kind: "lab",
  reportDate: new Date(),
  values: [{ type: "TSH", value: 2.1 }],
};
let checks = 0;
async function check(name: string, test: () => Promise<unknown>) {
  await test();
  checks += 1;
  console.log(`PASS ${name}`);
}
async function rejectsStatus(action: () => Promise<unknown>, status: number) {
  await assert.rejects(
    action,
    (error: unknown) =>
      error instanceof AssessmentError && error.status === status,
  );
}

async function main() {
  await check(
    "clinic report, observations, tasks and patient update share one transaction",
    async () => {
      const target = store();
      await target.save(input);
      assert.equal(target.transactions(), 1);
      assert.equal(target.committed.length, 3);
      assert(target.taskStoreValidated());
    },
  );
  await check(
    "failure after report creation commits no partial clinical state",
    async () => {
      const target = store({ failObservation: true });
      await assert.rejects(() => target.save(input));
      assert.equal(target.committed.length, 0);
    },
  );
  await check(
    "invalid measurements fail before database mutation",
    async () => {
      const target = store();
      await rejectsStatus(
        () =>
          target.save({
            ...input,
            values: [{ type: "unrecognized", value: 1 }],
          }),
        400,
      );
      assert.equal(target.transactions(), 0);
    },
  );
  await check("missing patients cannot gain an attachment record", async () => {
    const target = store({ missing: true });
    await rejectsStatus(() => target.save(input), 404);
    assert.equal(target.committed.length, 0);
  });
  await check(
    "link revocation is checked inside the saving transaction",
    async () => {
      const target = store({ version: 2 });
      await rejectsStatus(
        () =>
          target.save({ ...input, source: "patient", expectedLinkVersion: 1 }),
        401,
      );
      assert.equal(target.committed.length, 0);
    },
  );
  await check(
    "patient-supplied data cannot self-promote to verified trends",
    async () => {
      const target = store();
      const report = await target.save({
        ...input,
        source: "patient",
        expectedLinkVersion: 1,
        reviewStatus: "verified",
      });
      assert.equal(report.reviewStatus, "pending");
      assert.equal(report.reviewedAt, null);
      assert.equal(target.committed.length, 2);
    },
  );
  await check(
    "patient writes require an authoritative credential version",
    async () => {
      const target = store();
      await rejectsStatus(
        () => target.save({ ...input, source: "patient" }),
        401,
      );
      assert.equal(target.committed.length, 0);
    },
  );
  await check(
    "pending quota is checked while the patient lock is held",
    async () => {
      const target = store({ pending: 8 });
      await rejectsStatus(
        () =>
          target.save({ ...input, source: "patient", expectedLinkVersion: 1 }),
        429,
      );
      assert.equal(target.committed.length, 0);
    },
  );
  await check(
    "staff intake rechecks the locked waiting-queue boundary",
    async () => {
      const target = store({ waiting: false });
      await rejectsStatus(
        () => target.save({ ...input, source: "staff" }),
        403,
      );
      assert.equal(target.committed.length, 0);
    },
  );
  await check(
    "staff files remain pending even if a caller claims verification",
    async () => {
      const target = store({ waiting: true });
      const report = await target.save({
        ...input,
        source: "staff",
        reviewStatus: "verified",
      });
      assert.equal(report.reviewStatus, "pending");
      assert.equal(target.committed.length, 2);
    },
  );
  await check(
    "rejected attachments cannot open a write transaction",
    async () => {
      const target = store({ malware: true });
      await rejectsStatus(
        () =>
          target.save({
            ...input,
            file: {
              name: "synthetic.txt",
              mime: "text/plain",
              bytes: new Uint8Array([1]),
            },
          }),
        422,
      );
      assert.equal(target.transactions(), 0);
      assert.equal(target.committed.length, 0);
    },
  );
  await check(
    "global-write escape mutation fails the transaction oracle",
    async () => {
      await store().save(input);
      await assert.rejects(() => store({ mutant: true }).save(input));
    },
  );
  console.log(
    `ALL PASS: ${checks} transaction-isolated report save checks; real PostgreSQL concurrency remains a separate integration test`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
