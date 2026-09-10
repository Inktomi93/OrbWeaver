// THE TIER LADDER IS DATA, AND THIS IS WHAT IT SAYS (#1523 split it, #1842 finished the cut).
//
// `verify --push` spent its wall clock recertifying our own instruments: measured 2026-09-04 over 1,867
// files, `tests/tooling` was 71.1 CPU-min across 284 files against 9.0 for tests/server's 1,185. Owner
// 2026-09-04: "about 30 minutes of tooling recertification, which makes it tedious to run tests… move that
// to verify --full"; owner 2026-09-06: "take tooling out of the verify push and into full". #1523's first
// cut left a CONDITIONAL push rung (run the battery when the branch touched an instrument); #1842 deleted
// that rung's DATA — `tests:tooling` is a FULL-tier row now, and the `tierPrecondition` field survives in
// the stage contract for the next row that needs it, with no row using it today.
//
// The membership is registry DATA (UNIFIED-VERIFICATION-DESIGN §3.1), so these arms read the registry
// rather than a prose table.
import type { StageDef, Tier } from "../../../../tooling/src/verify/contract/stage.ts";
import { stagesForTier } from "../../../../tooling/src/verify/lib/registry.ts";
import { stageLine } from "../../../../tooling/src/verify/lib/run-render.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const WHOLE_TIERS: readonly Tier[] = ["changed", "static", "push", "full"];

function stage(tier: Parameters<typeof stagesForTier>[0], name: string): StageDef {
  const found = stagesForTier(tier).find((row) => row.name === name);
  if (found === undefined) {
    throw new Error(
      `no stage named ${name} at tier ${tier}: ${stagesForTier(tier)
        .map((row) => row.name)
        .join(", ")}`,
    );
  }
  return found;
}

test("tests:tooling is a REAL stage at full — and at NO other tier", () => {
  const fullRow = stage("full", "tests:tooling");

  expect(fullRow.argv).toEqual(["pnpm", "test:tooling"]);
  expect(fullRow.group).toBe("tests");
  // THE #1842 CUT, stated as data: not at push (the owner's ruling), and not at static either (`pnpm
  // check` runs no tests at all, so this row must not smuggle one in).
  expect(stagesForTier("push").some((row) => row.name === "tests:tooling")).toBe(false);
  expect(stagesForTier("static").some((row) => row.name === "tests:tooling")).toBe(false);
  expect(stagesForTier("changed").some((row) => row.name === "tests:tooling")).toBe(false);
});

test("tests:node stays the push bar for everything else, and no longer carries the tooling battery", () => {
  // `pnpm test:node`'s project list is what makes the exclusion real; the row's argv is the pointer to it.
  // The argv changed in #1848: this stage was `pnpm test`, the COMPOSITE that also ran the whole CT suite,
  // and the two halves shared one 45-minute hang ceiling that the sum outgrew (a false `[tool-error]` on a
  // quiet box). CT is now the sibling `browser:ct` stage with its own profile-derived ceiling; `pnpm test`
  // survives untouched as the green-to-commit ritual and as the manual `tests:product-composite` row.
  expect(stage("push", "tests:node").argv).toEqual(["pnpm", "test:node"]);
  expect(stagesForTier("push").some((row) => row.name === "tests:node")).toBe(true);
  // The `changed` inner loop still reaches `tests/tooling` (#1566) through Vitest's native configured
  // project population, without copying a project-name list into the registry. The real resolver proof is
  // in registry.int.test.ts; the composed argv/selection proof is in ops/run.int.test.ts.
  expect(stage("changed", "tests:node").scopedArgv).toBeTypeOf("function");
});

test("mutation:arid is a discoverable manual report-input tool, never an automatic tier", () => {
  const row = stagesForTier("manual").find((candidate) => candidate.name === "quality:mutation-arid");
  expect(row).toMatchObject({
    group: "quality",
    tiers: ["manual"],
    argv: ["pnpm", "mutation:arid"],
  });
  expect(row?.manualReason).toContain("existing Stryker JSON report path");
  expect(row?.classify(2), "an unreadable report is a tool error").toBe(2);
  expect(row?.classify(3), "missing report arguments are misuse").toBe(3);
  for (const tier of WHOLE_TIERS) {
    expect(stagesForTier(tier).some((candidate) => candidate.name === "quality:mutation-arid")).toBe(false);
  }
});

test("NO row hangs on a tier precondition today — the mechanism is unused DATA, not a live rung", () => {
  // #1523 minted `tierPrecondition` for the conditional push rung; #1842 removed the rung. The field is
  // still in the contract (contract/stage.ts) and the runner still honours it (ops/run.ts, pinned by
  // tests/tooling/verify/ops/run.int.test.ts against a synthetic row) — but a CONDITIONAL membership that
  // nobody declares must not silently reappear: if a row grows one, that is a ladder change, and this arm
  // makes it a deliberate edit rather than a quiet one.
  for (const tier of WHOLE_TIERS) {
    for (const row of stagesForTier(tier)) {
      expect(row.tierPrecondition, `${row.name} declares a tier precondition at ${tier}`).toBeUndefined();
    }
  }
});

// #1566: `skipped` carries TWO different facts and the console printed only one of them. A scoped skip
// means the selection held no relevant file; a tier-precondition skip is a WHOLE-tier run, where "no files
// in scope" is simply false — and the reader deciding whether their push was really covered is reading
// this line, not verify.json. The renderer keeps both spellings even though no row declares a precondition
// today: the runner path is live and the words are what a future rung would print.
test("a tier-precondition skip says so and names the tier that DOES run it; a scoped skip is unchanged", () => {
  const base = {
    name: "tests:tooling",
    group: "tests",
    mode: "skipped",
    ok: true,
    exitCode: 0,
    durationMs: 0,
    logFile: null,
    failureExcerpt: null,
    notices: [],
  } as const;

  expect(stageLine({ ...base, runsAt: "verify --full" })).toContain("skipped — tier precondition not met; runs at verify --full");
  // THE CONTROL: `runsAt: null` is what a SCOPED skip carries, and its wording must not have moved.
  expect(stageLine({ ...base, name: "lint:eslint", group: "lint", runsAt: null })).toContain("skipped (no files in scope)");
});
