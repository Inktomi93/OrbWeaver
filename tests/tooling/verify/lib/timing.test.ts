// PER-GATE COST (#1107) — the planted controls, in BOTH directions, for the ledger `check-structure.json`
// now publishes: a healthy ledger is a verdict, and a gate that reports NO wall-clock refuses the run
// rather than reaching the artifact as a silent `undefined` that reads as "instant".
//
// WHY THE UNTIMED ARM IS A UNIT TEST AND NOT A PLANTED CLI RUN: the harness times every hook through ONE
// wrapper (`guard`), so a REAL run cannot produce an untimed gate on demand — the only way to reach that
// state is a writer regression (a phase added to the dispatcher and not to the clock) or an artifact
// re-read from an older writer. Both arrive as `undefined` while satisfying `tsc` at the call site, which
// is why the alarm's parameter is `TimingLedgerView` (the ledger as a READER receives it) rather than
// `PassResult`: the broken shapes below are then ordinary values of a real type, never a cast past one.
import type { GatePassResult, TimingGateView, TimingLedgerView } from "../../../../tooling/src/verify/contract/pass.ts";
import { timingAlarms, timingLine } from "../../../../tooling/src/verify/lib/timing.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const SCAN = { candidates: 1, scanned: 1, skipped: 0, skipReasons: {}, visited: 1, admitted: 0, admittedRatified: 0, populations: [] } as const;

function gate(name: string, phaseMs: Partial<GatePassResult["timing"]["phaseMs"]>): GatePassResult {
  const phases = { begin: 0, visit: 0, visitFile: 0, run: 0, finalize: 0, ...phaseMs };
  const totalMs = phases.begin + phases.visit + phases.visitFile + phases.run + phases.finalize;
  return { name, ok: true, findings: [], scan: SCAN, timing: { totalMs, phaseMs: phases } };
}

/** A ledger AS A READER RECEIVES IT (`TimingLedgerView`) — which is the point of every broken arm below.
 *  A live `PassResult` is assignable to this view, so the healthy control measures the same door
 *  production calls, while a gate whose `timing` never arrived is expressible here WITHOUT a cast. */
function ledger(gates: readonly TimingGateView[], totalMs: number): TimingLedgerView {
  return { gates, timing: { totalMs, gateMs: gates.reduce((sum, g) => sum + (g.timing?.totalMs ?? 0), 0) } };
}

test("a fully timed pass raises NO alarm — the negative control the refusals below are read against", () => {
  expect(timingAlarms(ledger([gate("planted-cheap", { visit: 1.5 }), gate("planted-hog", { run: 199.25 })], 500))).toEqual([]);
});

test("a gate with NO wall-clock refuses the run instead of publishing a silent undefined", () => {
  const untimed: TimingGateView = { name: "planted-untimed" };
  const alarms = timingAlarms(ledger([gate("planted-ok", { run: 3 }), untimed], 500));
  expect(alarms).toHaveLength(1);
  expect(alarms[0]).toContain("planted-untimed");
  expect(alarms[0]).toContain("UNTIMED, not instant");
});

test("a gate missing ONE phase's clock is refused by name — a partial breakdown is not a breakdown", () => {
  const missingRun: TimingGateView = {
    name: "planted-half-timed",
    timing: { totalMs: 12, phaseMs: { begin: 0, visit: 0, visitFile: 0, finalize: 0 } },
  };
  const alarms = timingAlarms(ledger([missingRun], 500));
  expect(alarms).toHaveLength(1);
  expect(alarms[0]).toContain("planted-half-timed");
  expect(alarms[0]).toContain("phase(s) run");
});

test("a non-finite clock is refused exactly like a missing one — NaN is not a measurement", () => {
  const nan: TimingGateView = { name: "planted-nan", timing: { totalMs: Number.NaN, phaseMs: gate("x", {}).timing.phaseMs } };
  expect(timingAlarms(ledger([nan], 500))[0]).toContain("planted-nan");
});

test("a ledger whose gates outweigh the pass is refused — a part cannot exceed the whole", () => {
  const impossible: TimingLedgerView = { gates: [gate("planted-hog", { run: 900 })], timing: { totalMs: 100, gateMs: 900 } };
  expect(timingAlarms(impossible)[0]).toContain("does not add up");
});

test("a pass with no timing of its own is refused — there is no total to check the gates against", () => {
  const noTotal: TimingLedgerView = { gates: [gate("planted-ok", { run: 1 })] };
  expect(timingAlarms(noTotal)[0]).toContain("no wall-clock of its own");
});

test("the summary line names the slowest gates with the phase that dominated each, and the artifact path", () => {
  const gates = [
    gate("planted-cheap", { visit: 1 }),
    gate("planted-hog", { run: 115_000 }),
    gate("planted-walker", { visit: 4000, begin: 1 }),
    gate("planted-file", { visitFile: 57 }),
    gate("planted-final", { finalize: 20 }),
    gate("planted-tail", { begin: 0.5 }),
  ];
  const line = timingLine({ totalMs: 292_600, gateMs: 119_078.5 }, gates, "reports/runs/structure/x/check-structure.json");
  expect(line).toContain("single-pass cost: 292600.0ms wall — gate hooks 119078.5ms, harness 173521.5ms");
  // Sorted by cost, capped at five, each carrying the phase that dominated it: the six-gate input drops
  // the cheapest, and `planted-hog` must lead with `run` (the whole finding the ledger exists to surface).
  expect(line).toContain(
    "slowest 5: planted-hog 115000.0ms (run) · planted-walker 4001.0ms (visit) · planted-file 57.0ms (visitFile) · planted-final 20.0ms (finalize) · planted-cheap 1.0ms (visit)",
  );
  expect(line).not.toContain("planted-tail");
  expect(line).toContain("(per-gate timing: reports/runs/structure/x/check-structure.json)");
});
