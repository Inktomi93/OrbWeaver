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
import { applyPathTriggers, WHOLE_COMMAND_PATH_TRIGGERS } from "../../../../tooling/src/verify/lib/registry-triggers.ts";
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

// #1943 F3. The #1842 cut is right about the BATTERY and left one hole behind it: `.claude/hooks/*.mjs` is
// linted by nothing (biome.json ignores `.claude`; eslint's node surface globs name no `.mjs`), and the
// PreToolUse Bash guard's only executing check lived in the `--full`-only battery — so a syntax error in
// the hook that gates EVERY Bash call would fail it open (non-zero, no JSON ⇒ non-blocking hook error)
// with `pnpm check` and `pnpm verify --push` both still green. Two rows close it, and their TIERS are the
// whole point: parsing on the commit bar, behaviour on the push bar.
test("the Bash guard has a floor below --full: syntax at STATIC, its pin at PUSH", () => {
  const syntax = stage("static", "lint:hook-syntax");
  expect(syntax.group).toBe("lint");
  // a raw-bin argv, not `pnpm <script>`: `node --check` takes ONE file, so the family check is the loop
  expect(syntax.argv[0]).toBe("bash");
  expect(syntax.argv.join(" ")).toContain("node --check");
  expect(syntax.argv.join(" ")).toContain(".claude/hooks/*.mjs");
  expect(stagesForTier("push").some((row) => row.name === "lint:hook-syntax")).toBe(true);

  const pin = stage("push", "tests:tool-guard");
  expect(pin.group).toBe("tests");
  expect(pin.argv).toEqual(["pnpm", "test:scoped", "tests/tooling/tool-guard.int.test.ts"]);
  expect(stagesForTier("full").some((row) => row.name === "tests:tool-guard")).toBe(true);
  // …and NOT on the static bar: `pnpm check` runs no tests, and this row must not smuggle one in.
  expect(stagesForTier("static").some((row) => row.name === "tests:tool-guard")).toBe(false);
});

test("tests:node stays the push bar for everything else, and no longer carries the tooling battery", () => {
  // `pnpm test:node`'s project list is what makes the exclusion real; the row's argv is the pointer to it.
  // The argv changed in #1848: this stage was `pnpm test`, the COMPOSITE that also ran the whole CT suite,
  // and the two halves shared one 45-minute hang ceiling that the sum outgrew (a false `[tool-error]` on a
  // quiet box). CT is now the sibling `browser:ct` stage with its own profile-derived ceiling; `pnpm test`
  // survives untouched as the explicit product-test command and manual `tests:product-composite` row.
  expect(stage("push", "tests:node").argv).toEqual(["pnpm", "test:node"]);
  expect(stagesForTier("push").some((row) => row.name === "tests:node")).toBe(true);
  // The `changed` inner loop still reaches `tests/tooling` (#1566) through Vitest's native configured
  // project population, without copying a project-name list into the registry. The real resolver proof is
  // in registry.int.test.ts; the composed argv/selection proof is in ops/run.int.test.ts.
  expect(stage("changed", "tests:node").scopedArgv).toBeTypeOf("function");
});

// #1941 — THE WHOLE-CORPUS CONFORMANCE STAGE. Before it, a converted defineGate policy's own mustFlag/mustPass rows
// ran only where a committed family test imported the module (21 of 163 were imported by none, 2026-09-11), so a
// policy could land with rows nobody ever executed. The stage is on the COMMIT bar, whole-only, and its exit is our
// own scheme (a failed proof is exit 2 — the checker's claim about itself broke).
test("structure:policy-conformance runs every final policy's proofs at STATIC, whole-only, on our own exit scheme", () => {
  const row = stage("static", "structure:policy-conformance");
  expect(row.argv).toEqual(["pnpm", "check:policy-conformance"]);
  expect(row.group).toBe("structure");
  expect(row.classify(0)).toBe(0);
  expect(row.classify(2)).toBe(2);
  expect(row.classify(null)).toBe(2);
  // WHOLE-ONLY, RE-POINTED BY #2277 AND NOT WEAKENED. This line read `scopedArgv toBeUndefined()` and the
  // stage was absent from `changed`. The RULING is "a policy's proofs are its own fixtures, not a property
  // of any changed file, and the roster is the whole corpus" — it survives verbatim, because the stage's
  // path trigger runs its OWN WHOLE argv or nothing. What changed is WHEN it is asked, never what it reads:
  // a commit touching a gate module now gets the conformance verdict at `verify --changed` instead of
  // deferring it to a static run the #1584 hook bypass suppresses. So the assertion moves to the property
  // the ruling actually states.
  // THE TRIGGER IS DATA and this file reads data (a Selection needs the ts-morph membership snapshot, which
  // belongs in the ops suite — `run.int.test.ts` pins the BEHAVIOUR through a real one).
  const trigger = WHOLE_COMMAND_PATH_TRIGGERS["structure:policy-conformance"]?.paths;
  expect(row.scopedArgv, "path-triggered, so the scoped tier ASKS it").toBeDefined();
  expect(trigger?.test("tooling/src/verify/gates/tooling-size.ts"), "a gate module moves the roster").toBe(true);
  expect(trigger?.test("README.md"), "and nothing else does — an untouched roster is not owed").toBe(false);
  // the ladder nests: static ⊂ push ⊂ full, and the scoped inner loop now asks it when a gate module moved
  expect(stagesForTier("push").some((candidate) => candidate.name === "structure:policy-conformance")).toBe(true);
  expect(stagesForTier("full").some((candidate) => candidate.name === "structure:policy-conformance")).toBe(true);
  expect(stagesForTier("changed").some((candidate) => candidate.name === "structure:policy-conformance")).toBe(true);
});

test("#2303 — every whole-only static stage must have an explicit trigger-table decision", () => {
  const unaccounted: StageDef = {
    name: "structure:unaccounted",
    group: "structure",
    tiers: ["static"],
    argv: ["pnpm", "check:unaccounted"],
    classify: () => 0,
  };
  expect(() => applyPathTriggers([unaccounted])).toThrow("whole-only static stage is absent from WHOLE_COMMAND_PATH_TRIGGERS: structure:unaccounted");
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

test("quality:cpd preserves the wrapped tool's clean, violation, and non-verdict exits", () => {
  const row = stage("push", "quality:cpd");
  expect(row.classify(0)).toBe(0);
  expect(row.classify(1)).toBe(1);
  expect(row.classify(2)).toBe(2);
  expect(row.classify(null)).toBe(2);
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
