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
import type { RunSlot } from "@orb/tooling/_shared/artifacts";
import { checkoutName, openRunSlot, publishRunSlot } from "@orb/tooling/_shared/artifacts";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import type { GateDescriptor } from "../contract/gate.ts";
import type { GateCorpus } from "../contract/gate-corpus.ts";
import type { GateResult, Violation } from "../contract/harness.ts";
import type { PassResult, PassTiming, PopulationAlarm, ToolError } from "../contract/pass.ts";
import type { RunManifest } from "../contract/run-manifest.ts";
import { loadGateCorpus } from "../lib/loader.ts";
import { projectCtx, runPass, stripProbeFindings, zeroScanGates } from "../lib/pass.ts";
import { populationAlarms } from "../lib/population.ts";
import { renderPass } from "../lib/render.ts";
import { timingAlarms, timingLine } from "../lib/timing.ts";

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
 *  nothing about the RUN — so a shorter run and a killed run were both indistinguishable from a clean one.
 *
 *  `populationAlarms` joined 2026-09-01 (#946) for the class one level down ONCE MORE: files visited is not
 *  the denominator a COVERAGE gate's verdict rests on, so a gate whose members moved behind an import kept
 *  a healthy file count while judging a shrunken set (docs/reviews/stickler/2026-08-31-gate-member-discovery-rehome-audit.md). */
interface StructureReport {
  readonly run: RunManifest;
  readonly gates: readonly GateResult[];
  readonly toolErrors: readonly ToolError[];
  /** Gates that ran and read NOTHING — a blind checker, judged only here at real-tree scope. */
  readonly scanAlarms: readonly string[];
  /** Declared SEMANTIC-MEMBER populations that came back empty or left declarations unresolved (#946) —
   *  the same "not a verdict" class as `scanAlarms`, one level down: the gate read plenty of files and
   *  judged a shrunken member set. Judged only here, for the same real-tree-scope reason. */
  readonly populationAlarms: readonly PopulationAlarm[];
  /** WHAT THE RUN COST (#1107) — the pass wall clock beside the sum of its gates, with the per-gate
   *  breakdown on each `gates[].timing`. Joined 2026-09-02 for the class beside `scan`: the artifact said
   *  what every gate DECIDED and how much it READ, and nothing about what it took — so a gate-cost claim
   *  could only come from a scratch profiler and could never be re-derived from the canonical artifact
   *  (memory `structure-full-cost-is-gate-code-not-ts-morph`). A gate that reports NO timing is refused
   *  here like a short run (`timingAlarms`), never published as a silent `undefined`. */
  readonly timing: PassTiming;
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
    return { name: g.name, ok: violations.length === 0, violations, scan: g.scan, timing: g.timing };
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

/** The artifact's name — inside this run's slot, and the published pointer's basename (#1029). */
const REPORT_NAME = "check-structure.json";

/** Write into THIS RUN'S slot. Never the published path: `reports/check-structure.json` is a symlink
 *  publishRunSlot swaps in at completion, so no in-flight write can ever be read as somebody's verdict. */
function writeReport(slot: RunSlot, report: StructureReport): void {
  writeFileSync(join(slot.dir, REPORT_NAME), `${JSON.stringify(report, null, 2)}\n`);
}

/** The IN-FLIGHT stub (#410). Written BEFORE the walk, so a run killed mid-pass leaves an artifact whose
 *  own `run.complete: false` refuses to be read as a verdict. Since #1029 it lands in the run's own slot
 *  and the slot's in-flight marker is what surfaces it to a fixed-path reader (`abandonedRuns`). */
function writeInFlight(slot: RunSlot, run: RunManifest): void {
  // The zeroed timing is the honest stub value: nothing has run yet. `run.complete: false` is what tells
  // a reader this is not a verdict — the cost ledger never has to carry that signal too.
  writeReport(slot, { run, gates: [], toolErrors: [], scanAlarms: [], populationAlarms: [], timing: { totalMs: 0, gateMs: 0 }, total: 0, ok: false });
}

function startManifest(root: string, slot: RunSlot): RunManifest {
  return {
    runId: slot.runId,
    checkout: checkoutName(root),
    artifactDir: slot.relDir,
    concurrent: slot.racing,
    startedAt: new Date().toISOString(),
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

/** A concurrent writer is NAMED, never silently last-write-wins (#1029). stderr, not stdout: the verdict
 *  stream stays parseable, and a lane reading only the artifact still finds the same list in `run.concurrent`. */
function announceRacing(slot: RunSlot): void {
  if (slot.racing.length > 0) {
    process.stderr.write(`[check:structure] CONCURRENT RUN(S) of this instrument on this checkout: ${slot.racing.join(", ")}\n`);
    process.stderr.write(`[check:structure] this run writes to ${slot.relDir} and publishes reports/${REPORT_NAME} only if it finishes last.\n`);
  }
}

/** The single-pass run: load the descriptors, run one pass, render, write the JSON, and RETURN the 0/1/2
 *  verdict (2 when any gate threw, read nothing, or the run did not reconcile; 1 on violations; 0 clean).
 *  The cli's `runTool` sets `process.exitCode` from it — never `process.exit`, which drops the buffered
 *  stdout write below and truncates a large report mid-line (the fixture-run report the check-gates
 *  anti-drift test parses). */
export async function runStructure(root: string): Promise<number> {
  const slot = openRunSlot(root, "structure");
  announceRacing(slot);
  const started = startManifest(root, slot);
  writeInFlight(slot, started);

  const corpus = await loadGateCorpus(root);
  const gatesByName = new Map(corpus.gates.map((g) => [g.name, g]));
  // Probe-artifact findings are stripped UNLESS this run is the check-gates conformance suite's own
  // child (it plants __g_ fixtures and MUST see them fire — it sets ORB_GATE_FIXTURES=1).
  const rawPass = runPass(corpus.gates, projectCtx(root));
  // biome-ignore lint/style/noProcessEnv: ORB_GATE_FIXTURES is the check-gates suite's opt-out knob for its own child runs — harness plumbing, not app config.
  const pass = process.env["ORB_GATE_FIXTURES"] === "1" ? rawPass : stripProbeFindings(rawPass);

  // An UNTIMED gate rides the same class as a SHORT run (lib/timing.ts): both leave a report that looks
  // complete while a fact the artifact promises is silently absent.
  const incompleteReasons = [...reconcile(corpus, pass), ...timingAlarms(pass)];
  const gates = toGateResults(pass, gatesByName);
  const total = gates.reduce((n, g) => n + g.violations.length, 0);
  const scanAlarms = zeroScanGates(pass);
  const populations = populationAlarms(pass);
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
  process.stdout.write(`${timingLine(pass.timing, pass.gates, `${slot.relDir}/${REPORT_NAME}`)}\n`);

  writeReport(slot, {
    run,
    gates,
    toolErrors: pass.toolErrors,
    scanAlarms,
    populationAlarms: populations,
    timing: pass.timing,
    total,
    ok: total === 0 && pass.toolErrors.length === 0 && scanAlarms.length === 0 && populations.length === 0 && incompleteReasons.length === 0,
  });
  // Published at the END and only here: a reader arriving at reports/check-structure.json therefore always
  // resolves to a run that FINISHED — its own or a sibling's — never to an in-flight or torn artifact.
  publishRunSlot(root, slot, [{ alias: REPORT_NAME, target: REPORT_NAME }]);

  // A short run, a blind gate, a refused POPULATION receipt and a thrown gate ride the SAME severity: in
  // all four the run is not a verdict. A short run is the worst of them — a throw is loud and a blind gate
  // renders ⚠, but a gate that never ran leaves NOTHING behind at all.
  if (pass.toolErrors.length > 0 || scanAlarms.length > 0 || populations.length > 0 || incompleteReasons.length > 0) {
    return EXIT.toolError;
  }
  return total > 0 ? EXIT.violations : EXIT.clean;
}

/** The visible half of the #410 guarantee: the console says how many of the corpus actually ran. */
function completenessLine(run: RunManifest): string {
  if (run.incompleteReasons.length === 0) {
    return `single-pass: ran ${run.ran}/${run.active} active gate(s) of ${run.corpusFiles} corpus file(s) — run COMPLETE (run ${run.runId} → ${run.artifactDir}/${REPORT_NAME})`;
  }
  return [
    `single-pass: run INCOMPLETE — the report is NOT a verdict (run ${run.runId}):`,
    ...run.incompleteReasons.map((r) => `  ‼ ${r}`),
    "  See tooling/src/verify/contract/run-manifest.ts (#410).",
  ].join("\n");
}
