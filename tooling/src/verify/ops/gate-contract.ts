import { existsSync } from "node:fs";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { inspectGateContract } from "../lib/gate-contract.ts";

refuseDirectInvocation(import.meta.url, "pnpm gate:contract");

export function runGateContract(root: string): number {
  if (!existsSync(`${root}/tsconfig.json`)) {
    process.stdout.write("gate-contract: 0 finding(s) across 0 gate module(s)\n");
    process.stderr.write("gate-contract: TOOL ERROR — gate discovery resolved zero modules, so this run is not a migration verdict\n");
    return EXIT.toolError;
  }
  const project = getWorkspace({ root, types: true, globs: [`${root}/tooling/src/verify/gates/*.ts`] });
  const report = inspectGateContract(project.getSourceFiles(), root);
  process.stdout.write(`gate-contract: ${report.findings.length} finding(s) across ${report.files} gate module(s)\n`);
  if (report.files === 0) {
    process.stderr.write("gate-contract: TOOL ERROR — gate discovery resolved zero modules, so this run is not a migration verdict\n");
    return EXIT.toolError;
  }
  for (const finding of report.findings) {
    process.stdout.write(`${finding.file}:${finding.line}:${finding.column} [${finding.code}] ${finding.detail}\n`);
  }
  return report.findings.length === 0 ? EXIT.clean : EXIT.violations;
}
