// The structural-gate orchestrator (`pnpm check:structure`). The entrypoint runs the single-pass machine
// (loadGates auto-discovers every scripts/check/gates/*.ts descriptor → runPass → one walk → renderPass).
// Add a gate by dropping it in gates/ — the loader IS the registry.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import type { GateDescriptor } from "./contract.ts";
import type { GateResult, Violation } from "./harness.ts";
import { loadGates } from "./loader.ts";
import type { PassResult } from "./pass.ts";
import { projectCtx, runPass } from "./pass.ts";
import { renderPass } from "./render.ts";

/** JSON shape for `reports/check-structure.json` — the read-don't-rerun artifact show.ts renders. */
interface StructureReport {
  readonly gates: readonly GateResult[];
  readonly total: number;
  readonly ok: boolean;
}

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;

/** Map the single-pass PassResult into the `check-structure.json` shape: each gate's per-occurrence
 *  findings collapse into `{file,line,message}` violations, where the message is the finding's own
 *  override or the gate descriptor's `message`. */
function toStructureReport(
  pass: PassResult,
  gatesByName: ReadonlyMap<string, GateDescriptor>,
): StructureReport {
  const gates: GateResult[] = pass.gates.map((g) => {
    const descriptor = gatesByName.get(g.name);
    const violations: Violation[] = g.findings.map((f) => ({
      file: f.file,
      line: f.line,
      message: f.message ?? descriptor?.message ?? g.name,
    }));
    return { name: g.name, ok: violations.length === 0, violations };
  });
  const total = gates.reduce((n, g) => n + g.violations.length, 0);
  return { gates, total, ok: total === 0 && pass.toolErrors.length === 0 };
}

function writeStructureReport(root: string, report: StructureReport): void {
  const reportsDir = join(root, "reports");
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, "check-structure.json"), `${JSON.stringify(report, null, 2)}\n`);
}

/** The single-pass run entrypoint: load the descriptors, run one pass, render, write the JSON, exit on
 *  the 0/1/2 scheme (2 when any gate threw; 1 on violations; 0 clean). */
async function runSinglePass(root: string): Promise<void> {
  const gates = await loadGates(root);
  const gatesByName = new Map(gates.map((g) => [g.name, g]));
  const pass = runPass(gates, projectCtx(root));

  process.stdout.write(renderPass(pass, gatesByName));
  process.stdout.write("\n");

  const report = toStructureReport(pass, gatesByName);
  writeStructureReport(root, report);

  if (pass.toolErrors.length > 0) {
    process.exit(EXIT_TOOL_ERROR); // a gate threw — the checker is broken, not your code
  }
  if (report.total > 0) {
    process.exit(EXIT_VIOLATIONS);
  }
  process.exitCode = EXIT_CLEAN;
}

// Direct-run guard: importing this module (e.g. a test) does NOT execute a run.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await runSinglePass(process.cwd());
}
