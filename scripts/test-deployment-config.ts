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
  "pnpm exec tsx scripts/check-assessment-schema.ts",
  "pnpm run build",
  "pnpm exec tsx scripts/test-assessment-package.ts",
];
const configuration = JSON.parse(readFileSync("vercel.json", "utf8")) as DeploymentConfig;

function verifyConfiguration(candidate: DeploymentConfig) {
  assert.deepEqual(Object.keys(candidate).sort(), ["$schema", "buildCommand", "git"].sort());
  assert.equal(candidate.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(candidate.buildCommand, commands.join(" && "));
  assert.deepEqual(candidate.git, { deploymentEnabled: { "**": false, main: true } });
}

for (const path of ["scripts/test-deployment-config.ts", "scripts/check-assessment-schema.ts", "scripts/test-assessment-package.ts"]) {
  assert(existsSync(path), `Deployment check is missing: ${path}`);
}
verifyConfiguration(configuration);
console.log("PASS versioned main-only deployment configuration preserves the ordered build gates");

const mutations: Array<{ name: string; alter: (candidate: DeploymentConfig) => void }> = [
  { name: "missing default-deny branch rule", alter: (candidate) => { delete candidate.git.deploymentEnabled["**"]; } },
  { name: "default-deny pattern missing slash-separated branches", alter: (candidate) => { delete candidate.git.deploymentEnabled["**"]; candidate.git.deploymentEnabled["*"] = false; } },
  { name: "unexpected preview deployment", alter: (candidate) => { candidate.git.deploymentEnabled["feature/**"] = true; } },
  { name: "database check after the build", alter: (candidate) => { candidate.buildCommand = [commands[0], commands[2], commands[1], commands[3]].join(" && "); } },
  { name: "missing native packaging check", alter: (candidate) => { candidate.buildCommand = commands.slice(0, 3).join(" && "); } },
  { name: "shell separator bypassing a failed check", alter: (candidate) => { candidate.buildCommand = commands.join("; "); } },
  { name: "embedded environment configuration", alter: (candidate) => { candidate.env = { DATABASE_URL: "synthetic-placeholder" }; } },
];
for (const mutation of mutations) {
  const candidate = structuredClone(configuration);
  mutation.alter(candidate);
  assert.throws(() => verifyConfiguration(candidate), mutation.name);
  console.log(`PASS configuration oracle rejects ${mutation.name}`);
}
console.log(`ALL PASS: ${mutations.length + 1} deployment configuration checks`);
