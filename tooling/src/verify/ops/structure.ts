// The structural-gate orchestrator (`pnpm check:structure` → `cli.ts structure`). It runs the single-pass
// machine (loadGateCorpus auto-discovers every tooling/src/verify/gates/*.ts descriptor → runPass → one walk
// → renderPass). Add a gate by dropping it in gates/ — the loader IS the registry.
//
// RUN COMPLETENESS (#410, contract/run-manifest.ts): the artifact is written TWICE — an IN-FLIGHT stub the
// moment the run starts, and the finished report at the end — and the counts are reconciled before any
// clean/violations exit. A killed run therefore leaves an artifact that SAYS it is not a verdict instead of
// leaving the previous run's complete-looking file for the next reader to consume.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { ensureReportsDir } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { GateDescriptor } from "../contract/gate.ts";
import type { GateResult, Violation } from "../contract/harness.ts";
import type { PassResult, ToolError } from "../contract/pass.ts";
import type { RunManifest } from "../contract/run-manifest.ts";
import type { GateCorpus } from "../lib/loader.ts";
import { loadGateCorpus } from "../lib/loader.ts";
import { projectCtx, runPass, stripProbeFindings, zeroScanGates } from "../lib/pass.ts";
import { renderPass } from "../lib/render.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

/** JSON shape for `reports/check-structure.json` — the read-don't-rerun artifact ops/show.ts renders.
 *  `toolErrors` joined 2026-08-03: a gate that THREW previously reached the artifact only as a bare
 *  `ok:false` with zero violations — show had nothing to display, so the read-reports-don't-rerun
 *  doctrine went blind exactly when the checker itself was broken.
 *
 *  `scanAlarms` + per-gate `scan` joined 2026-08-13 (Codex GA-H-01/GA-H-02) for the same class one level
 *  down: the artifact reported STATUS with no DENOMINATOR, so a gate whose scanRoot stopped matching read
 *  zero files and reported ✓ — indistinguishable from a clean tree — and 278 ratchet-admitted findings sat
 *  invisible behind green.
 *
 *  `run` joined 2026-08-21 (#410) for the class one level down AGAIN: the artifact reported a verdict with
 *  nothing about the RUN — so a shorter run and a killed run were both indistinguishable from a clean one. */
interface StructureReport {
  readonly run: RunManifest;
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
function toGateResults(pass: PassResult, gatesByName: ReadonlyMap<string, GateDescriptor>): readonly GateResult[] {
  return pass.gates.map((g) => {
    const descriptor = gatesByName.get(g.name);
    const violations: Violation[] = g.findings.map((f) => ({
      file: f.file,
      line: f.line,
      message: f.message ?? descriptor?.message ?? g.name,
    }));
    return { name: g.name, ok: violations.length === 0, violations, scan: g.scan };
  });
}

/** The reconciliation (#410): every corpus file accounted for, and every ACTIVE descriptor actually run.
 *  A mismatch means the report is SHORTER than the corpus — the exact shape a silently-skipped gate makes,
 *  and the one a verdict must never be read off. */
function reconcile(corpus: GateCorpus, pass: PassResult): readonly string[] {
  const out: string[] = [];
  const active = corpus.gates.filter((g) => g.status === "active").length;
  if (pass.gates.length !== active) {
    out.push(`${pass.gates.length} gate(s) produced a result but ${active} were ACTIVE — the pass is short by ${active - pass.gates.length}`);
  }
  if (corpus.unregistered.length > 0) {
    out.push(`${corpus.unregistered.length} corpus file(s) registered NO descriptor (the loader skipped them): ${corpus.unregistered.join(", ")}`);
  }
  return out;
}

function writeReport(root: string, report: StructureReport): void {
  writeFileSync(join(ensureReportsDir(root), "check-structure.json"), `${JSON.stringify(report, null, 2)}\n`);
}

/** The IN-FLIGHT stub (#410). Written BEFORE the walk, so a run killed mid-pass leaves an artifact whose
 *  own `run.complete: false` refuses to be read as a verdict — instead of leaving the PREVIOUS run's
 *  complete-looking file on disk for the next reader to mistake for this one's. */
function writeInFlight(root: string, run: RunManifest): void {
  writeReport(root, { run, gates: [], toolErrors: [], scanAlarms: [], total: 0, ok: false });
}

function startManifest(): RunManifest {
  const startedAt = new Date().toISOString();
  return {
    runId: `${process.pid}-${startedAt}`,
    startedAt,
    finishedAt: null,
    complete: false,
    corpusFiles: 0,
    registered: 0,
    unregistered: [],
    active: 0,
    ran: 0,
    incompleteReasons: [],
  };
}

/** The single-pass run: load the descriptors, run one pass, render, write the JSON, and RETURN the 0/1/2
 *  verdict (2 when any gate threw, read nothing, or the run did not reconcile; 1 on violations; 0 clean).
 *  The cli's `runTool` sets `process.exitCode` from it — never `process.exit`, which drops the buffered
 *  stdout write below and truncates a large report mid-line (the fixture-run report the check-gates
 *  anti-drift test parses). */
export async function runStructure(root: string): Promise<number> {
  const started = startManifest();
  writeInFlight(root, started);

  const corpus = await loadGateCorpus(root);
  const gatesByName = new Map(corpus.gates.map((g) => [g.name, g]));
  // Probe-artifact findings are stripped UNLESS this run is the check-gates conformance suite's own
  // child (it plants __g_ fixtures and MUST see them fire — it sets ORB_GATE_FIXTURES=1).
  const rawPass = runPass(corpus.gates, projectCtx(root));
  // biome-ignore lint/style/noProcessEnv: ORB_GATE_FIXTURES is the check-gates suite's opt-out knob for its own child runs — harness plumbing, not app config.
  const pass = process.env["ORB_GATE_FIXTURES"] === "1" ? rawPass : stripProbeFindings(rawPass);

  const incompleteReasons = reconcile(corpus, pass);
  const gates = toGateResults(pass, gatesByName);
  const total = gates.reduce((n, g) => n + g.violations.length, 0);
  const scanAlarms = zeroScanGates(pass);
  const run: RunManifest = {
    ...started,
    finishedAt: new Date().toISOString(),
    complete: true,
    corpusFiles: corpus.files.length,
    registered: corpus.gates.length,
    unregistered: corpus.unregistered,
    active: corpus.gates.filter((g) => g.status === "active").length,
    ran: pass.gates.length,
    incompleteReasons,
  };

  // zeroScanAlarm is set HERE and nowhere else: this is the only entrypoint whose fileset is the real
  // whole tree, so it is the only one where "this gate read nothing" means the checker is blind.
  process.stdout.write(renderPass(pass, gatesByName, { zeroScanAlarm: true }));
  process.stdout.write(`\n${completenessLine(run)}\n`);

  writeReport(root, {
    run,
    gates,
    toolErrors: pass.toolErrors,
    scanAlarms,
    total,
    ok: total === 0 && pass.toolErrors.length === 0 && scanAlarms.length === 0 && incompleteReasons.length === 0,
  });

  // A short run, a blind gate and a thrown gate ride the SAME severity: in all three the run is not a
  // verdict. A short run is the worst of them — a throw is loud and a blind gate renders ⚠, but a gate
  // that never ran leaves NOTHING behind at all.
  if (pass.toolErrors.length > 0 || scanAlarms.length > 0 || incompleteReasons.length > 0) {
    return EXIT.toolError;
  }
  return total > 0 ? EXIT.violations : EXIT.clean;
}

/** The visible half of the #410 guarantee: the console says how many of the corpus actually ran. */
function completenessLine(run: RunManifest): string {
  if (run.incompleteReasons.length === 0) {
    return `single-pass: ran ${run.ran}/${run.active} active gate(s) of ${run.corpusFiles} corpus file(s) — run COMPLETE (run ${run.runId})`;
  }
  return [
    `single-pass: run INCOMPLETE — the report is NOT a verdict (run ${run.runId}):`,
    ...run.incompleteReasons.map((r) => `  ‼ ${r}`),
    "  See tooling/src/verify/contract/run-manifest.ts (#410).",
  ].join("\n");
}
