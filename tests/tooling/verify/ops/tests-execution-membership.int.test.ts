// The PERMANENT PIN for `tests-execution-membership`'s direction 3 (#1096): one-lane-ness — every test
// file claimed by EXACTLY ONE runtime view. Before this pin the stage asserted only "run by SOME runner"
// and "every runner glob matches SOME file" (directions 1-2); a file resolving to TWO runtime projects (a
// vitest include overlap, or a file straddling two runner families) was an unverified CONSTRUCTION
// property of the include/exclude sets — checkable only by hand off `vitest list --json`'s per-entry
// `projectName`. This makes it a checked invariant instead.
//
// RED-FIRST: `findMultiMembershipFiles`/the `types`-is-non-runtime classification did not exist before
// this commit (`git show HEAD:tooling/src/verify/index.ts` — no such export) — a test importing it against
// the unmodified source fails to resolve, which is the red-first receipt for the whole direction.
//
// (a) below is the fixture-level positive control (a file claimed by two runtime views REDs naming both);
// (b) is the existing "zero-runner-view" direction re-pinned unchanged; (c) is the real-tree green, which
// also proves the per-project counts the doc's §tests-execution-membership cites are re-derived, not
// copied — the stage shells out to `vitest list`/`playwright test --list` for real, so this arm runs the
// actual CLI (`runCli`, process-spawning — `.int.test.ts`), not a fixture.

import { TEST_RESOURCE_NAMES, VITEST_RUNTIME_FAMILY_GROUPS, VITEST_TYPECHECK_GROUP_NAMES } from "@orb/tooling/_shared/test-kinds";
import { findMultiMembershipFiles, findUnrunFiles, unclassifiedVitestProjects } from "@orb/tooling/verify";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

// #1842 — THE MEASURED FALSE CLEAN this direction was missing. The repository-resource group was added to
// `vitest.config.ts` and NOT to the stage's runtime-project set; the stage stayed green (three ✓) with the
// lane's ten files still in the direction-2 union and direction 3 reding only on TWO OR MORE claims, never
// on zero — the per-project line just stopped mentioning the lane. Planted control, both directions:
test("a vitest project the stage cannot classify is named — and a known one never is (#1842)", () => {
  // The planted positive control: a project name nobody classified.
  expect(unclassifiedVitestProjects(["unit", "repository", "a-lane-nobody-classified"])).toEqual(["a-lane-nobody-classified"]);
  expect(unclassifiedVitestProjects(["typesnode"]), "a type-only group outside the canonical types-* convention must refuse").toEqual(["typesnode"]);
  // The negative arm: every real lane, runtime AND typecheck-only, classifies silently.
  expect(unclassifiedVitestProjects([...VITEST_RUNTIME_FAMILY_GROUPS, ...TEST_RESOURCE_NAMES, "tooling", ...VITEST_TYPECHECK_GROUP_NAMES])).toEqual([]);
});

test("a file claimed by two runtime views REDs naming both views (fixture)", () => {
  const membership = new Map<string, readonly string[]>([
    ["tests/server/x.test.ts", ["vitest:unit"]],
    ["tests/server/y.test.ts", ["vitest:unit", "vitest:integration"]],
    ["tests/e2e/z.spec.ts", ["playwright-e2e"]],
  ]);
  const multi = findMultiMembershipFiles(membership);
  expect(multi).toEqual([["tests/server/y.test.ts", ["vitest:unit", "vitest:integration"]]]);
});

test("a `types`-only file (typecheck, no runtime pass) is never flagged as multi-claimed (fixture)", () => {
  // `types` is excluded from VITEST_RUNTIME_PROJECTS inside the stage — a `.test-d.ts` file that ONLY
  // vitest's `types` project lists (no runtime project claims it) must never surface here; membership only
  // ever contains RUNTIME views (buildRuntimeMembership drops `types` before this map is built), so a
  // single-entry membership row for a types-only file is the correct, unflagged shape.
  const membership = new Map<string, readonly string[]>([["tests/kit/x.test-d.ts", []]]);
  expect(findMultiMembershipFiles(membership)).toEqual([]);
});

test("no test file is matched by no runner (fixture, direction 2 unchanged)", () => {
  const testFiles = ["tests/a.test.ts", "tests/b.test.ts"];
  const runnerUnion = new Set(["tests/a.test.ts"]);
  expect(findUnrunFiles(testFiles, runnerUnion)).toEqual(["tests/b.test.ts"]);
});

test("the real tree is clean against independent native --list oracles: every view is non-empty, every authored kind is run, and no file is multi-claimed", async ({
  runCli,
}) => {
  const res = await runCli("verify", ["tests-execution-membership"], { timeoutMs: scaledBudget(110_000) });
  await expect(res).toExitWith(0);
  expect(res.stdout).toContain("every claimed test file is claimed by exactly one runtime view");
  expect(res.stdout).toContain("every tests/** runner-suffixed file is matched by ≥1 runner view");
  // The per-project counts this pin's own header + the design doc's §tests-execution-membership cite are
  // RE-DERIVED here, not hardcoded — a real tree carries hundreds of files per project; a near-zero count
  // means the derivation stopped reading (`vitest list --json` broke, or the project classification lost
  // a project name), same shape as the ledgers-fresh MIN_TRACKED_SPECS control.
  const summaryLine = res.stdout.split("\n").find((line) => line.includes("runtime views by project:"));
  expect(summaryLine).toBeDefined();
  const counts = Object.fromEntries(
    (summaryLine ?? "")
      .replace("  runtime views by project:", "")
      .split("·")
      .map((part) => part.trim())
      .filter((part) => part.length > 0)
      .map((part) => {
        const [project, count] = part.split(" ");
        return [project, Number(count)];
      }),
  );
  for (const project of ["unit", "integration"]) {
    expect(counts[project]).toBeGreaterThan(100);
  }
  expect(counts["contract"]).toBeGreaterThan(10);
}, 120_000);
