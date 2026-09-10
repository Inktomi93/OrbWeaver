// THE PRODUCT-TEST STAGE FITS ITS BUDGET (#1848) — the registry half of the fix, asserted against the
// REGISTRY, because that is what a `pnpm verify` run actually reads.
//
// THE DEFECT, with its receipt: `pnpm verify --full` on 2026-09-06 (slot
// reports/runs/verify/main-3786947-2026-09-06T18-22-36-535Z, stages/tests-node.log:2473) printed
// `[proc] TIMED OUT after 2700000ms — killed the process group` for `tests:node` on a QUIET box. That stage
// was `pnpm test` — the vitest projects (~10 min) AND the whole CT suite — under ONE hand-typed 45-minute
// ceiling in ops/run.ts, and #1835 had just put CT on the shared profile's worker cap. The result is an
// exit-2 tool error, which under the exit contract means "the run is not a verdict": a push/full run could
// no longer certify anything, on a machine doing nothing else.
//
// SO THE ARMS BELOW ARE THE TWO HALVES OF "it fits": the stage that runs the CT suite has its OWN ceiling
// DERIVED from the profile's caps (not a constant, not a literal repeated here), and the composite that
// used to hide both suites in one stage can no longer run inside a tier at all — otherwise the split would
// have doubled every push instead of fixing it.
import { readStageBudgets } from "@orb/tooling/_shared/concurrency-profile";
import type { StageDef } from "@orb/tooling/verify";
import { REGISTRY } from "../../../../tooling/src/verify/lib/registry.ts";
import { ctSuiteHangCeilingMs, stageHangCeilingBaseMs } from "../../../../tooling/src/verify/lib/stage-budget.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function stage(name: string): StageDef {
  const row = REGISTRY.find((candidate) => candidate.name === name);
  expect(row, `the registry must still carry a "${name}" stage`).toBeDefined();
  return row as StageDef;
}

test("the WHOLE-CT-SUITE stage runs at push and full, with a ceiling derived from the profile", () => {
  const ct = stage("browser:ct");
  expect(ct.tiers, "the CT suite IS the push bar's coverage verdict — it must run there").toContain("push");
  expect(ct.tiers).toContain("full");
  expect(ct.argv, "and it retries parallelism flakes VISIBLY at the gate tiers").toEqual(["pnpm", "test:ct", "--retries=2"]);
  // The load-bearing relation: this stage's ceiling is the DERIVED one, and it is strictly larger than the
  // default every other stage gets. A regression to a shared constant makes these two equal.
  expect(stageHangCeilingBaseMs(ct)).toBe(ctSuiteHangCeilingMs());
  expect(stageHangCeilingBaseMs(ct), "the CT suite outgrew the default — that is the whole defect").toBeGreaterThan(readStageBudgets().defaultMs);
});

test("the vitest half is its own stage, and the composite that hid both cannot run in a tier", () => {
  const node = stage("tests:node");
  expect(node.argv, "`pnpm test:node` is the vitest projects ONLY — the CT half is browser:ct now").toEqual(["pnpm", "test:node"]);
  expect(stageHangCeilingBaseMs(node), "a ~10-minute suite keeps the default ceiling").toBe(readStageBudgets().defaultMs);

  // `pnpm test` is still the explicit product-test command and a NAMED stage, so verify-registry-parity
  // stays satisfied — but a tier row here would run both suites a second time.
  const composite = stage("tests:product-composite");
  expect(composite.argv).toEqual(["pnpm", "test"]);
  expect(composite.tiers, "manual ONLY — the runner runs the halves").toEqual(["manual"]);
});

test("no two GATING stages invoke the same script — a split that double-runs is the failure mode", () => {
  const invocations = REGISTRY.filter((row) => !row.tiers.includes("manual"))
    .map((row) => row.argv.join(" "))
    .filter((argv) => argv.startsWith("pnpm "));
  expect(new Set(invocations).size, `duplicate stage invocations: ${invocations.join(" · ")}`).toBe(invocations.length);
});
