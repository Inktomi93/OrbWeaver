// PER-POLICY COST (#1107) — the planted controls, in BOTH directions, for the ledger
// `check-structure.json` publishes: a healthy ledger is a verdict, and a policy that reports NO wall-clock
// refuses the run rather than reaching the artifact as a silent `undefined` that reads as "instant".
//
// THIS FILE WAS THE LEGACY HALF'S PROOF UNTIL #2176 PHASE F (2026-09-14). `timingAlarms`/`timingLine` read
// the legacy single-pass ledger and retired with its dispatcher; the PROPERTY they held did not, so the
// same controls are re-aimed at `policyTimingAlarms`/`policyTimingLine`, which are the surviving readers of
// the only ledger the artifact still carries. Nothing about the refusal's shape changed — only its subject.
//
// WHY THE UNTIMED ARM IS A UNIT TEST AND NOT A PLANTED CLI RUN: the dispatcher times every phase through
// one wrapper, so a REAL run cannot produce an untimed policy on demand — the only ways to reach that state
// are a writer regression (a phase added to the dispatcher and not to the clock) and an artifact re-read
// from an older writer. Both arrive as `undefined` while satisfying `tsc` at the call site, which is why
// the alarm's parameter is the LOOSE row view rather than `FinalPolicyRow`: the broken shapes below are
// then ordinary values of a real type, never a cast past one.
import type { PolicyPhase } from "../../../../tooling/src/verify/contract/policy-pass.ts";
import type { FinalPolicyRow } from "../../../../tooling/src/verify/contract/structure-report.ts";
import { policyTimingAlarms, policyTimingLine } from "../../../../tooling/src/verify/lib/timing.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ZERO_PHASES: Record<PolicyPhase, number> = { population: 0, create: 0, visitFile: 0, visit: 0, evaluate: 0, receipt: 0 };

/** A ledger ROW as a reader receives it. `timing` is deliberately shaped, never cast: the two ways it goes
 *  missing in production are exactly the two values below. */
function row(
  name: string,
  phaseMs: Partial<Record<PolicyPhase, number>>,
): { readonly name: string; readonly timing: { readonly totalMs: number; readonly phaseMs: Record<PolicyPhase, number> } } {
  const phases = { ...ZERO_PHASES, ...phaseMs };
  const totalMs = Object.values(phases).reduce((sum, ms) => sum + ms, 0);
  return { name, timing: { totalMs, phaseMs: phases } };
}

const HEALTHY_PASS = { totalMs: 500, policyMs: 300, factMs: 100 } as const;

test("a fully timed pass raises NO alarm — the negative control the refusals below are read against", () => {
  expect(policyTimingAlarms([row("planted-cheap", { visit: 1.5 }), row("planted-hog", { evaluate: 199.25 })], HEALTHY_PASS)).toEqual([]);
});

test("a policy with NO wall-clock refuses the run instead of publishing a silent undefined", () => {
  const untimed = { name: "planted-untimed" };
  const alarms = policyTimingAlarms([row("planted-ok", { evaluate: 3 }), untimed], HEALTHY_PASS);
  expect(alarms).toHaveLength(1);
  expect(alarms[0]).toContain("planted-untimed");
  expect(alarms[0]).toContain("UNTIMED, not instant");
});

test("a policy missing ONE phase's clock is refused by name — a partial breakdown is not a breakdown", () => {
  const { receipt: _dropped, ...missingReceipt } = { ...ZERO_PHASES, evaluate: 3 };
  const alarms = policyTimingAlarms([{ name: "planted-partial", timing: { totalMs: 3, phaseMs: missingReceipt } }], HEALTHY_PASS);
  expect(alarms).toHaveLength(1);
  expect(alarms[0]).toContain("planted-partial");
  expect(alarms[0]).toContain("receipt");
});

test("a non-finite clock is refused exactly like a missing one — NaN is not a measurement", () => {
  const nan = { name: "planted-nan", timing: { totalMs: Number.NaN, phaseMs: ZERO_PHASES } };
  expect(policyTimingAlarms([nan], HEALTHY_PASS)[0]).toContain("planted-nan");
});

test("a ledger whose policies outweigh the pass is refused — a part cannot exceed the whole", () => {
  expect(policyTimingAlarms([row("planted-ok", { evaluate: 1 })], { totalMs: 10, policyMs: 8, factMs: 8 })[0]).toContain("does not add up");
});

test("a pass with no timing of its own is refused — there is no total to check the policies against", () => {
  expect(policyTimingAlarms([row("planted-ok", { evaluate: 1 })], undefined)[0]).toContain("no wall-clock of its own");
});

/** The console line takes the WRITER's row shape, so this control builds one rather than a view. */
function fullRow(name: string, phaseMs: Partial<Record<PolicyPhase, number>>): FinalPolicyRow {
  const phases = { ...ZERO_PHASES, ...phaseMs };
  const totalMs = Object.values(phases).reduce((sum, ms) => sum + ms, 0);
  return {
    contract: "final",
    name,
    family: name,
    authority: "hard",
    severity: "error",
    workItem: null,
    ok: true,
    owner: { status: "success", population: "complete" },
    withheld: false,
    population: { declaredSourcePaths: 1, declaredResourcePaths: 0, effectiveSourcePaths: 1, effectiveResourcePaths: 0, requestedPaths: null },
    receipts: [],
    violations: [],
    waived: 0,
    granted: 0,
    timing: { totalMs, phaseMs: phases },
  };
}

test("the summary line names the slowest policies with the phase that dominated each", () => {
  const rows = [fullRow("planted-hog", { evaluate: 115_000 }), fullRow("planted-mid", { visit: 40 }), fullRow("planted-cheap", { create: 0.5 })];
  const line = policyTimingLine({ totalMs: 292_600, policyMs: 119_078.5, factMs: 1000 }, rows);
  expect(line).toContain("final-pass cost: 292600.0ms wall");
  // The dispatcher's own share is the subtraction a reader would otherwise have to do by hand.
  expect(line).toContain("dispatcher 172521.5ms");
  // Slowest FIRST, each with the phase that dominated it — the fix differs by phase.
  expect(line).toContain("planted-hog 115000.0ms (evaluate)");
  expect(line).toContain("planted-mid 40.0ms (visit)");
  expect(line.indexOf("planted-hog")).toBeLessThan(line.indexOf("planted-mid"));
});

test("the summary line says so when nothing ran, rather than printing an empty list", () => {
  expect(policyTimingLine({ totalMs: 1, policyMs: 0, factMs: 0 }, [])).toContain("(no policies ran)");
});
