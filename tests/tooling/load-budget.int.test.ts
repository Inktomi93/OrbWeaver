// The PERMANENT PIN for the load-honest budget helper (tests/tooling/_load-budget.ts) — issue #606. It
// proves the ONE guarantee the helper exists for: a load/contention kill SELF-IDENTIFIES as an exit-2
// not-a-verdict (ORB-LOAD-KILL) rather than surfacing as a generic timeout that reads like a real assertion
// red. A PLANTED slow child proves the classification fires; a fast child and a non-zero-exit child prove
// the two non-kill paths are untouched (solo behavior unchanged); and the pure factor is unit-checked with
// injected loadavg/core values so the "quiet box → factor 1 → solo budgets unchanged" contract is nailed.
import { expect, test } from "../support/tool-fixtures.ts";
import {
  computeLoadFactor,
  isLoadKill,
  isTimeoutKill,
  LOAD_KILL_MARKER,
  runNodeWithBudget,
  runPnpmWithBudget,
  scaledBudget,
  spawnNodeWithBudget,
} from "./_load-budget.ts";

// A child that outlives any budget we hand it — the planted SLOW case. Kept well above the 300ms budget so
// the kill is unambiguous, and it writes nothing, so a returned value could only be a missed kill.
const SLEEP_5S = "setTimeout(() => {}, 5000);";
const FATAL_EXIT_RE = /exit 2.*fatal/su;
const VERSION_RE = /^\d+\./u;
const KILL_BUDGET_MS = 300;

test("the pure load factor is 1 on a quiet box (solo budgets unchanged) and scales + caps under load", () => {
  // Quiet: per-core load below 1.0 → factor exactly 1, so scaledBudget(base) === base. This IS the
  // "solo runtime unchanged" contract, made a written assertion.
  expect(computeLoadFactor(0, 24)).toBe(1);
  expect(computeLoadFactor(8, 24)).toBe(1); // load-avg 8 on 24 cores is still per-core < 1
  // Contended: per-core load 4 → factor 4.
  expect(computeLoadFactor(96, 24)).toBe(4);
  // Runaway: capped so a wedged box can't inflate a budget to hours.
  expect(computeLoadFactor(1000, 24, 8)).toBe(8);
  // Degenerate inputs never scale (they'd otherwise NaN a budget).
  expect(computeLoadFactor(Number.NaN, 24)).toBe(1);
  expect(computeLoadFactor(50, 0)).toBe(1);
});

test("scaledBudget never shrinks below its base (a budget is a floor, not a lottery)", () => {
  expect(scaledBudget(45_000)).toBeGreaterThanOrEqual(45_000);
});

test("a PLANTED slow child is a legible ORB-LOAD-KILL, not a generic failure (execFileSync path)", ({ repoRoot }) => {
  let thrown: unknown;
  try {
    runNodeWithBudget(["-e", SLEEP_5S], { cwd: repoRoot }, KILL_BUDGET_MS, "planted slow case");
  } catch (err) {
    thrown = err;
  }
  // The classification fires: the error self-identifies as a load kill, distinct from any assertion red.
  expect(isLoadKill(thrown)).toBe(true);
  expect((thrown as Error).message).toContain(LOAD_KILL_MARKER);
  expect((thrown as Error).message).toContain("NOT a verdict");
});

test("a fast child returns its stdout untouched — the non-kill path is unchanged", ({ repoRoot }) => {
  const out = runNodeWithBudget(["-e", "process.stdout.write('ok');"], { cwd: repoRoot }, 30_000, "fast case");
  expect(out).toBe("ok");
});

test("the workspace runner enters through pnpm and preserves its successful output", ({ repoRoot }) => {
  expect(runPnpmWithBudget(["--version"], { cwd: repoRoot }, 30_000, "pnpm entry probe")).toMatch(VERSION_RE);
});

test("a child that exits NON-ZERO without being killed still returns stdout (the gate-fired shape)", ({ repoRoot }) => {
  // report.ts exits 1 when a gate fires; the caller must still receive the report on stdout, NOT a throw.
  const out = runNodeWithBudget(["-e", "process.stdout.write('report-body'); process.exit(1);"], { cwd: repoRoot }, 30_000, "exit-1 case");
  expect(out).toBe("report-body");
});

test("a fatal child exit is preserved instead of returning its partial report", ({ repoRoot }) => {
  expect(() =>
    runNodeWithBudget(["-e", "process.stdout.write('partial'); process.stderr.write('fatal'); process.exit(2);"], { cwd: repoRoot }, 30_000, "exit-2 case"),
  ).toThrow(FATAL_EXIT_RE);
});

test("spawnNodeWithBudget: a planted slow child throws a legible kill; a normal exit returns its status", ({ repoRoot }) => {
  let thrown: unknown;
  try {
    spawnNodeWithBudget(["-e", SLEEP_5S], repoRoot, KILL_BUDGET_MS, "planted slow spawn");
  } catch (err) {
    thrown = err;
  }
  expect(isLoadKill(thrown)).toBe(true);

  const run = spawnNodeWithBudget(["-e", "process.exit(2);"], repoRoot, 30_000, "normal spawn");
  expect(run.status).toBe(2);
});

// BOTH KILL SHAPES (#999 f, 2026-09-01). A `pnpm check:structure` child killed at its budget under loadavg
// 38/24 cores did NOT arrive as a SIGTERM'd exit — node surfaced spawnSync's own error object instead
// (`code:"ETIMEDOUT"`, `signal:null`, `status:0`), so the SIGTERM-only discriminator missed it and the kill
// printed as an opaque "child exit 0". The planted-slow-child tests above only ever produce the SIGTERM
// shape on this box, which is exactly why the OTHER shape needs a direct pin: an instrument that classifies
// one of two real shapes reads as covered while staying blind to the one that actually happened.
test("BOTH timeout-kill shapes classify as kills, and nothing else does", () => {
  expect(isTimeoutKill({ signal: "SIGTERM" })).toBe(true);
  expect(isTimeoutKill({ code: "ETIMEDOUT", signal: null })).toBe(true);
  // A plain non-zero exit and a DIFFERENT signal are verdicts, not kills — over-claiming would launder a
  // real red into "not a verdict", which is the opposite failure and just as dishonest.
  expect(isTimeoutKill({ signal: null })).toBe(false);
  expect(isTimeoutKill({ code: "ENOENT", signal: null })).toBe(false);
  expect(isTimeoutKill({ signal: "SIGKILL" })).toBe(false);
  expect(isTimeoutKill({})).toBe(false);
});

test("isLoadKill rejects a plain assertion-style error — the two are never conflated", () => {
  expect(isLoadKill(new Error("expected [] to equal [ 'x' ]"))).toBe(false);
  expect(isLoadKill("not even an error")).toBe(false);
});
