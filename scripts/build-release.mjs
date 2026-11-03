import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
// Keep this manifest ordered: schema and security checks precede the build,
// and trace-only worker checks accept the resulting artifact before promotion.
export const releaseCommands = [
  ["node", "--import", "tsx", "scripts/test-deployment-config.ts"],
  ["node", "--import", "tsx", "scripts/test-scanner-transport.ts"],
  ["node", "--import", "tsx", "scripts/test-report-attachments.ts"],
  ["node", "--import", "tsx", "scripts/test-report-save.ts"],
  ["node", "--import", "tsx", "scripts/test-audio-runtime.ts"],
  ["node", "scripts/test-scanner-gateway.mjs"],
  ["node", "scripts/test-live-monitor.mjs"],
  ["pnpm", "exec", "tsx", "scripts/check-assessment-schema.ts"],
  ["node", "--import", "tsx", "scripts/check-live-clinic-schema.ts"],
  ["node", "--import", "tsx", "scripts/check-private-scanner.ts"],
  ["pnpm", "run", "build"],
  ["pnpm", "exec", "tsx", "scripts/test-assessment-package.ts"],
  ["pnpm", "exec", "tsx", "scripts/test-assessment-package.ts", "report"],
  ["pnpm", "exec", "tsx", "scripts/test-assessment-package.ts", "patient-page"],
  ["pnpm", "exec", "tsx", "scripts/test-assessment-package.ts", "report-page"],
  ["pnpm", "exec", "tsx", "scripts/test-assessment-package.ts", "staff-page"],
  ["pnpm", "exec", "tsx", "scripts/test-assessment-package.ts", "photos"],
  ["pnpm", "exec", "tsx", "scripts/test-assessment-package.ts", "audio"],
];
/** @param {(command:string,args:string[],options:object)=>{status:number|null,error?:Error}} [run] */
export function runReleaseBuild(run = spawnSync) {
  for (const [command, ...args] of releaseCommands) {
    const result = run(command, args, { stdio: "inherit", env: process.env });
    if (result.error) {
      console.error("FAIL release gate could not start: " + command);
      return 1;
    }
    if (result.status !== 0) return result.status || 1;
  }
  return 0;
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  process.exitCode = runReleaseBuild();
