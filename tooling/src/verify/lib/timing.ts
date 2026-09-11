// PER-GATE COST — the two readers of the harness's timing ledger (#1107): the alarm that refuses an
// UNTIMED run, and the summary line that names the slowest gates on the console.
//
// WHY IT EXISTS. `reports/check-structure.json` carried a verdict (`gates`), a denominator (`scan`) and a
// run manifest (`run`) — and NO COST. So every gate-cost claim in this repo came out of a scratch
// profiler: the 2026-08-30 research lane had to wrap `runPass`'s hooks by hand to learn that `run` hooks
// are 199s of a 292s `structure:full` and that ONE lib (`bus-coverage`) is 115s of that, and its own
// report names the artifact's missing per-gate timing as the reason nobody could see it. A number no
// reader can re-derive from the canonical artifact is an anecdote; per-gate `timing` makes the same
// finding a `jq` away.
//
// THE REFUSAL IS THE POINT of `timingAlarms`. A gate record that arrives without a finite `ms` is a BROKEN
// WRITER, and what it produces — a missing number that reads as "instant" — is exactly the placebo shape
// the scan alarm (`zeroScanGates`) refuses one level up. So it rides the same severity: the run is NOT a
// verdict (exit 2), never a silently untimed report.
import type { GatePassResult, GatePhase, PassTiming, TimingLedgerView } from "../contract/pass.ts";
import { GATE_PHASES } from "../contract/pass.ts";
import type { PolicyPassTiming, PolicyPhase } from "../contract/policy-pass.ts";
import { POLICY_PHASES } from "../contract/policy-pass.ts";
import type { FinalPolicyRow } from "../contract/structure-report.ts";

/** How many gates the console line names. FIVE: the measured cost distribution is extremely long-tailed
 *  (one lib was 115s of a 292s pass), so the top handful IS the actionable content, while a longer list
 *  pushes the completeness line off a reader's screen. The full per-gate table is in the artifact — this
 *  line is a POINTER to it, never a replacement. */
const SLOWEST_REPORTED = 5;

function isMs(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** THE UNTIMED-GATE REFUSAL, in `incompleteReasons`' voice — the caller folds these into the run manifest,
 *  so an untimed run prints "run INCOMPLETE" and exits 2 exactly like a short one.
 *
 *  It reads a `TimingLedgerView`, not a `PassResult`, and that IS the ownership: the two ways a gate's
 *  timing genuinely goes missing (an artifact re-read from an older writer; a phase added to the
 *  dispatcher and not to the clock) both satisfy `tsc` at the call site, so the reader's parameter type
 *  has to admit them or the check reads as dead code — and its controls would have to fabricate one. */
export function timingAlarms(pass: TimingLedgerView): readonly string[] {
  const out: string[] = [];
  for (const gate of pass.gates) {
    const timing = gate.timing;
    if (timing === undefined || !isMs(timing.totalMs)) {
      out.push(`gate '${gate.name}' reported NO wall-clock — the run is UNTIMED, not instant (tooling/src/verify/lib/timing.ts, #1107)`);
      continue;
    }
    const missing = GATE_PHASES.filter((phase) => !isMs(timing.phaseMs?.[phase]));
    if (missing.length > 0) {
      out.push(`gate '${gate.name}' reported no wall-clock for phase(s) ${missing.join(", ")} — the per-phase breakdown is incomplete (#1107)`);
    }
  }
  const timing = pass.timing;
  if (timing === undefined || !isMs(timing.totalMs) || !isMs(timing.gateMs)) {
    out.push("the pass reported no wall-clock of its own — the timing ledger has no total to check the gates against (#1107)");
    return out;
  }
  if (timing.gateMs > timing.totalMs) {
    out.push(`the timing ledger does not add up: gates sum to ${fmt(timing.gateMs)} of a ${fmt(timing.totalMs)} pass — a part cannot exceed the whole (#1107)`);
  }
  return out;
}

/** One number, one unit, one precision — a cost a reader can diff across runs. */
function fmt(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

/** The phase that dominated this gate — what a reader needs BEFORE opening the artifact, because the fix
 *  differs by phase: a `run` hog re-sweeps the whole corpus, a `visit` hog subscribes to a token kind. */
function dominantPhase(gate: GatePassResult): GatePhase {
  return GATE_PHASES.reduce((worst, phase) => (gate.timing.phaseMs[phase] > gate.timing.phaseMs[worst] ? phase : worst), "run");
}

/** The console's cost line: the pass total split into gate hooks vs the harness's own share, then the
 *  `SLOWEST_REPORTED` most expensive gates with the phase each spent it in. Printed beside the
 *  completeness line by ops/structure.ts. */
export function timingLine(timing: PassTiming, gates: readonly GatePassResult[], artifactPath: string): string {
  const slowest = [...gates].sort((a, b) => b.timing.totalMs - a.timing.totalMs).slice(0, SLOWEST_REPORTED);
  const named = slowest.map((gate) => `${gate.name} ${fmt(gate.timing.totalMs)} (${dominantPhase(gate)})`).join(" · ");
  const harness = Math.max(0, timing.totalMs - timing.gateMs);
  return [
    `single-pass cost: ${fmt(timing.totalMs)} wall — gate hooks ${fmt(timing.gateMs)}, harness ${fmt(harness)}`,
    `  slowest ${String(slowest.length)}: ${named === "" ? "(no gates ran)" : named}`,
    `  (per-gate timing: ${artifactPath})`,
  ].join("\n");
}

/** A final row's timing as a READER receives it (the loose shape `timingAlarms`' view takes, for the same reason). */
interface PolicyTimingRowView {
  readonly name: string;
  readonly timing?: { readonly totalMs?: number | undefined; readonly phaseMs?: Partial<Record<PolicyPhase, number>> | undefined } | undefined;
}

/** The FINAL side of the untimed refusal (mixed runtime, #1584 §5): every policy row owes a finite `totalMs` and a
 *  finite number for every `POLICY_PHASES` member, and the pass owes its three totals. Same class, same voice
 *  (`incompleteReasons`), same exit: an untimed final policy is a broken writer, never an instant one. */
export function policyTimingAlarms(rows: readonly PolicyTimingRowView[], timing: Partial<PolicyPassTiming> | undefined): readonly string[] {
  const out: string[] = [];
  for (const row of rows) {
    const t = row.timing;
    if (t === undefined || !isMs(t.totalMs)) {
      out.push(`final policy '${row.name}' reported NO wall-clock — the run is UNTIMED, not instant (tooling/src/verify/lib/timing.ts, #1107)`);
      continue;
    }
    const missing = POLICY_PHASES.filter((phase) => !isMs(t.phaseMs?.[phase]));
    if (missing.length > 0) {
      out.push(`final policy '${row.name}' reported no wall-clock for phase(s) ${missing.join(", ")} — the per-phase breakdown is incomplete (#1107)`);
    }
  }
  if (timing === undefined || !isMs(timing.totalMs) || !isMs(timing.policyMs) || !isMs(timing.factMs)) {
    out.push("the final pass reported no wall-clock of its own — the timing ledger has no total to check the policies against (#1107)");
    return out;
  }
  if (timing.policyMs + timing.factMs > timing.totalMs) {
    out.push(
      `the final timing ledger does not add up: policies ${fmt(timing.policyMs)} + facts ${fmt(timing.factMs)} exceed the ${fmt(timing.totalMs)} pass — a part cannot exceed the whole (#1107)`,
    );
  }
  return out;
}

function dominantPolicyPhase(row: FinalPolicyRow): PolicyPhase {
  return POLICY_PHASES.reduce((worst, phase) => (row.timing.phaseMs[phase] > row.timing.phaseMs[worst] ? phase : worst), "population");
}

/** The final pass's cost line beside the legacy one: wall, the policy/fact split, and the slowest policies. */
export function policyTimingLine(timing: PolicyPassTiming, rows: readonly FinalPolicyRow[]): string {
  const slowest = [...rows].sort((a, b) => b.timing.totalMs - a.timing.totalMs).slice(0, SLOWEST_REPORTED);
  const named = slowest.map((row) => `${row.name} ${fmt(row.timing.totalMs)} (${dominantPolicyPhase(row)})`).join(" · ");
  const dispatcher = Math.max(0, timing.totalMs - timing.policyMs - timing.factMs);
  return [
    `final-pass cost: ${fmt(timing.totalMs)} wall — policies ${fmt(timing.policyMs)}, facts ${fmt(timing.factMs)}, dispatcher ${fmt(dispatcher)}`,
    `  slowest ${String(slowest.length)}: ${named === "" ? "(no policies ran)" : named}`,
  ].join("\n");
}
