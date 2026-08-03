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
import type { PassResult, ToolError } from "./pass.ts";
import { projectCtx, runPass, stripProbeFindings } from "./pass.ts";
import { renderPass } from "./render.ts";

/** JSON shape for `reports/check-structure.json` — the read-don't-rerun artifact show.ts renders.
 *  `toolErrors` joined 2026-08-03: a gate that THREW previously reached the artifact only as a bare
 *  `ok:false` with zero violations — show.ts had nothing to display, so the read-reports-don't-rerun
 *  doctrine went blind exactly when the checker itself was broken. */
interface StructureReport {
  readonly gates: readonly GateResult[];
  readonly toolErrors: readonly ToolError[];
  readonly total: number;
  readonly ok: boolean;
}

const EXIT_CLEAN = 0;
const EXIT_VIOLATIONS = 1;
const EXIT_TOOL_ERROR = 2;

/** Map the single-pass PassResult into the `check-structure.json` shape: each gate's per-occurrence
 *  findings collapse into `{file,line,message}` violations, where the message is the finding's own
 *  override or the gate descriptor's `message`. */
function toStructureReport(pass: PassResult, gatesByName: ReadonlyMap<string, GateDescriptor>): StructureReport {
  const gates: GateResult[] = pass.gates.map((g) => {
    const descriptor = gatesByName.get(g.name);
    const violations: Violation[] = g.findings.map((f) => ({
      file: f.file,
      line: f.line,
      message: f.message ?? descriptor?.message ?? g.name,
      // exactOptionalPropertyTypes: the key may only exist when a non-default tier is present.
      ...(f.severity !== undefined && f.severity !== "error" ? { severity: f.severity } : {}),
    }));
    return { name: g.name, ok: violations.length === 0, violations };
  });
  const total = gates.reduce((n, g) => n + g.violations.length, 0);
  return { gates, toolErrors: pass.toolErrors, total, ok: total === 0 && pass.toolErrors.length === 0 };
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
  // Probe-artifact findings are stripped UNLESS this run is the check-gates conformance suite's own
  // child (it plants __g_ fixtures and MUST see them fire — it sets ORB_GATE_FIXTURES=1).
  const rawPass = runPass(gates, projectCtx(root));
  // biome-ignore lint/style/noProcessEnv: ORB_GATE_FIXTURES is the check-gates suite's opt-out knob for its own child runs — harness plumbing, not app config.
  const pass = process.env["ORB_GATE_FIXTURES"] === "1" ? rawPass : stripProbeFindings(rawPass);

  process.stdout.write(renderPass(pass, gatesByName));
  process.stdout.write("\n");

  const report = toStructureReport(pass, gatesByName);
  writeStructureReport(root, report);

  // Set exitCode (never process.exit) so the buffered stdout write above drains before the process ends —
  // process.exit() drops an unflushed pipe buffer, truncating a large report mid-line (the fixture-run
  // report the check-gates anti-drift test parses).
  if (pass.toolErrors.length > 0) {
    process.exitCode = EXIT_TOOL_ERROR; // a gate threw — the checker is broken, not your code
    return;
  }
  process.exitCode = report.total > 0 ? EXIT_VIOLATIONS : EXIT_CLEAN;
}

// Direct-run guard: importing this module (e.g. a test) does NOT execute a run.
const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  await runSinglePass(process.cwd());
}
