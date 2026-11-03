import { releaseCommands, runReleaseBuild } from "./build-release.mjs";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

type DeploymentConfig = {
  $schema: string;
  buildCommand: string;
  git: { deploymentEnabled: Record<string, boolean> };
  [key: string]: unknown;
};

const commands = [
  "node --import tsx scripts/test-deployment-config.ts",
  "node --import tsx scripts/test-scanner-transport.ts",
  "node --import tsx scripts/test-report-attachments.ts",
  "node --import tsx scripts/test-report-save.ts",
  "node scripts/test-scanner-gateway.mjs",
  "node scripts/test-live-monitor.mjs",
  "pnpm exec tsx scripts/check-assessment-schema.ts",
  "node --import tsx scripts/check-live-clinic-schema.ts",
  "node --import tsx scripts/check-private-scanner.ts",
  "pnpm run build",
  "pnpm exec tsx scripts/test-assessment-package.ts",
  "pnpm exec tsx scripts/test-assessment-package.ts report",
  "pnpm exec tsx scripts/test-assessment-package.ts patient-page",
  "pnpm exec tsx scripts/test-assessment-package.ts report-page",
  "pnpm exec tsx scripts/test-assessment-package.ts staff-page",
  "pnpm exec tsx scripts/test-assessment-package.ts photos",
  "pnpm exec tsx scripts/test-assessment-package.ts audio",
];
const configuration = JSON.parse(
  readFileSync("vercel.json", "utf8"),
) as DeploymentConfig;

function verifyConfiguration(candidate: DeploymentConfig) {
  assert.deepEqual(
    Object.keys(candidate).sort(),
    ["$schema", "buildCommand", "git"].sort(),
  );
  assert.equal(candidate.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(candidate.buildCommand, "node scripts/build-release.mjs");
  assert(candidate.buildCommand.length <= 256);
  assert.deepEqual(candidate.git, {
    deploymentEnabled: { "**": false, main: true },
  });
}

for (const path of [
  "scripts/test-deployment-config.ts",
  "scripts/check-assessment-schema.ts",
  "scripts/check-live-clinic-schema.ts",
  "scripts/check-private-scanner.ts",
  "scripts/test-assessment-package.ts",
]) {
  assert(existsSync(path), `Deployment check is missing: ${path}`);
}
function verifyGateOrder(gates: string[][]) {
  assert.deepEqual(
    gates.map((command) => command.join(" ")),
    commands,
  );
}
verifyGateOrder(releaseCommands);
const invoked: string[] = [];
assert.equal(
  runReleaseBuild((command: string, args: string[]) => {
    invoked.push([command, ...args].join(" "));
    return { status: 0 };
  }),
  0,
);
assert.deepEqual(invoked, commands);
let attempts = 0;
assert.equal(
  runReleaseBuild(() => ({ status: ++attempts === 3 ? 7 : 0 })),
  7,
);
assert.equal(attempts, 3);
assert.throws(() => verifyGateOrder([...releaseCommands].reverse()));
assert.throws(() =>
  verifyGateOrder(
    releaseCommands.filter(
      (command) => !command.join(" ").includes("check-live-clinic-schema"),
    ),
  ),
);
assert.throws(() =>
  verifyGateOrder(
    releaseCommands.filter(
      (command) => !command.join(" ").includes("test-assessment-package"),
    ),
  ),
);
console.log(
  "PASS the release runner executes every ordered gate, stops at failure and detects omitted/reordered schema/package checks",
);
verifyConfiguration(configuration);
console.log(
  "PASS versioned main-only deployment configuration preserves the ordered build gates",
);

const mutations: Array<{
  name: string;
  alter: (candidate: DeploymentConfig) => void;
}> = [
  {
    name: "missing default-deny branch rule",
    alter: (candidate) => {
      delete candidate.git.deploymentEnabled["**"];
    },
  },
  {
    name: "default-deny pattern missing slash-separated branches",
    alter: (candidate) => {
      delete candidate.git.deploymentEnabled["**"];
      candidate.git.deploymentEnabled["*"] = false;
    },
  },
  {
    name: "unexpected preview deployment",
    alter: (candidate) => {
      candidate.git.deploymentEnabled["feature/**"] = true;
    },
  },
  {
    name: "reordered build safety gates",
    alter: (candidate) => {
      candidate.buildCommand = [...commands].reverse().join(" && ");
    },
  },
  {
    name: "missing native packaging check",
    alter: (candidate) => {
      candidate.buildCommand = commands
        .filter((command) => !command.includes("test-assessment-package"))
        .join(" && ");
    },
  },
  {
    name: "shell separator bypassing a failed check",
    alter: (candidate) => {
      candidate.buildCommand = commands.join("; ");
    },
  },
  {
    name: "embedded environment configuration",
    alter: (candidate) => {
      candidate.env = { DATABASE_URL: "synthetic-placeholder" };
    },
  },
];
for (const mutation of mutations) {
  const candidate = structuredClone(configuration);
  mutation.alter(candidate);
  assert.throws(() => verifyConfiguration(candidate), mutation.name);
  console.log(`PASS configuration oracle rejects ${mutation.name}`);
}
console.log(
  `ALL PASS: ${mutations.length + 2} deployment configuration checks`,
);
