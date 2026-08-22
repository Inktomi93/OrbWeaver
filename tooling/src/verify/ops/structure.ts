// The structural-gate orchestrator (`pnpm check:structure` → `cli.ts structure`). It runs the single-pass
// machine (loadGates auto-discovers every tooling/src/verify/gates/*.ts descriptor → runPass → one walk →
// renderPass). Add a gate by dropping it in gates/ — the loader IS the registry.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { ensureReportsDir } from "@orb/tooling/_shared/artifacts";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { GateDescriptor } from "../contract/gate.ts";
import type { GateResult, Violation } from "../contract/harness.ts";
import type { PassResult, ToolError } from "../contract/pass.ts";
import { loadGates } from "../lib/loader.ts";
import { projectCtx, runPass, stripProbeFindings, zeroScanGates } from "../lib/pass.ts";
import { renderPass } from "../lib/render.ts";

/** JSON shape for `reports/check-structure.json` — the read-don't-rerun artifact ops/show.ts renders.
 *  `toolErrors` joined 2026-08-03: a gate that THREW previously reached the artifact only as a bare
 *  `ok:false` with zero violations — show had nothing to display, so the read-reports-don't-rerun
 *  doctrine went blind exactly when the checker itself was broken.
 *
 *  `scanAlarms` + per-gate `scan` joined 2026-08-13 (Codex GA-H-01/GA-H-02) for the same class one level
 *  down: the artifact reported STATUS with no DENOMINATOR, so a gate whose scanRoot stopped matching read
 *  zero files and reported ✓ — indistinguishable from a clean tree — and 278 ratchet-admitted findings sat
 *  invisible behind green. */
interface StructureReport {
  readonly gates: readonly GateResult[];
  readonly toolErrors: readonly ToolError[];
  /** Gates that ran and read NOTHING — a blind checker, judged only here at real-tree scope. */
  readonly scanAlarms: readonly string[];
  readonly total: number;
  readonly ok: boolean;
}

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
    }));
    return { name: g.name, ok: violations.length === 0, violations, scan: g.scan };
  });
  const total = gates.reduce((n, g) => n + g.violations.length, 0);
  const scanAlarms = zeroScanGates(pass);
  return { gates, toolErrors: pass.toolErrors, scanAlarms, total, ok: total === 0 && pass.toolErrors.length === 0 && scanAlarms.length === 0 };
}

function writeStructureReport(root: string, report: StructureReport): void {
  writeFileSync(join(ensureReportsDir(root), "check-structure.json"), `${JSON.stringify(report, null, 2)}\n`);
}

/** The single-pass run: load the descriptors, run one pass, render, write the JSON, and RETURN the 0/1/2
 *  verdict (2 when any gate threw or read nothing; 1 on violations; 0 clean). The cli's `runTool` sets
 *  `process.exitCode` from it — never `process.exit`, which drops the buffered stdout write above and
 *  truncates a large report mid-line (the fixture-run report the check-gates anti-drift test parses). */
export async function runStructure(root: string): Promise<number> {
  const gates = await loadGates(root);
  const gatesByName = new Map(gates.map((g) => [g.name, g]));
  // Probe-artifact findings are stripped UNLESS this run is the check-gates conformance suite's own
  // child (it plants __g_ fixtures and MUST see them fire — it sets ORB_GATE_FIXTURES=1).
  const rawPass = runPass(gates, projectCtx(root));
  // biome-ignore lint/style/noProcessEnv: ORB_GATE_FIXTURES is the check-gates suite's opt-out knob for its own child runs — harness plumbing, not app config.
  const pass = process.env["ORB_GATE_FIXTURES"] === "1" ? rawPass : stripProbeFindings(rawPass);

  // zeroScanAlarm is set HERE and nowhere else: this is the only entrypoint whose fileset is the real
  // whole tree, so it is the only one where "this gate read nothing" means the checker is blind.
  process.stdout.write(renderPass(pass, gatesByName, { zeroScanAlarm: true }));
  process.stdout.write("\n");

  const report = toStructureReport(pass, gatesByName);
  writeStructureReport(root, report);

  // A blind gate rides the SAME severity as a thrown one: in both cases the run is not a verdict. It is
  // strictly worse than a throw, in fact — a throw is loud, a zero-scan gate reports ✓.
  if (pass.toolErrors.length > 0 || report.scanAlarms.length > 0) {
    return EXIT.toolError; // a gate threw or read nothing — the checker is broken, not your code
  }
  return report.total > 0 ? EXIT.violations : EXIT.clean;
}
