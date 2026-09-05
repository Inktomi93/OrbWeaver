// THE TIER LADDER IS DATA, AND THIS IS WHAT IT SAYS (#1523).
//
// `verify --push` spent its wall clock recertifying our own instruments: measured 2026-09-04 over 1,867
// files, `tests/tooling` was 71.1 CPU-min across 284 files against 9.0 for tests/server's 1,185. Owner:
// "about 30 minutes of tooling recertification, which makes it tedious to run tests… move that to verify
// --full". The cut is a `tests:tooling` stage that is UNCONDITIONAL at `full` and CONDITIONAL at `push` —
// it runs there only when the branch actually touched an instrument.
//
// The membership is registry DATA (UNIFIED-VERIFICATION-DESIGN §3.1), so these arms read the registry
// rather than a prose table, and the LAST one is the arm that matters most: a precondition that cannot be
// computed must RUN the stage, never skip it. A gate whose "off" state is indistinguishable from "I could
// not tell" is the false-clean class this repo mints rows for.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { StageDef } from "../../../../tooling/src/verify/contract/stage.ts";
import { stagesForTier } from "../../../../tooling/src/verify/lib/registry.ts";
import { stageLine } from "../../../../tooling/src/verify/lib/run-render.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

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

test("tests:tooling is a REAL stage at push and full, and runs the tooling-only vitest project", () => {
  const pushRow = stage("push", "tests:tooling");

  expect(pushRow.argv).toEqual(["pnpm", "test:tooling"]);
  expect(pushRow.group).toBe("tests");
  expect(stage("full", "tests:tooling").name).toBe("tests:tooling");
  // NOT at the static tier: `pnpm check` runs no tests at all, and this row must not smuggle one in.
  expect(stagesForTier("static").some((row) => row.name === "tests:tooling")).toBe(false);
});

test("tests:node stays the push bar for everything else, and no longer carries the tooling battery", () => {
  // `pnpm test`'s project list is what makes the exclusion real; the row's argv is the pointer to it.
  expect(stage("push", "tests:node").argv).toEqual(["pnpm", "test"]);
  expect(stagesForTier("push").some((row) => row.name === "tests:node")).toBe(true);
});

test("the push rung is CONDITIONAL and the full rung is not — the ladder states which is which", () => {
  const precondition = stage("push", "tests:tooling").tierPrecondition;

  expect(precondition?.tiers).toEqual(["push"]);
  expect(precondition?.reason).toContain("tooling/**");
  expect(precondition?.reason).toContain("tests/tooling/**");
  // `full` is NOT in the precondition's tier list, so `verify --full` runs it unconditionally.
  expect(precondition?.tiers).not.toContain("full");
});

test("an UNANSWERABLE precondition returns null — which the runner treats as RUN, never as skip", () => {
  // A directory that is not a git repo at all: `git merge-base` fails, so the branch diff is unknowable.
  // The honest answer is `null`. If this ever returned `false`, `verify --push` would silently stop
  // running the instrument battery on any checkout whose git state it could not read.
  const outside = mkdtempSync(join(tmpdir(), "orb-not-a-repo-"));
  try {
    // Control: prove the fixture really is outside a repo, so the null below is the case we think it is.
    expect(runNicedSync("git", ["-C", outside, "rev-parse", "--git-dir"]).status).not.toBe(0);
    expect(stage("push", "tests:tooling").tierPrecondition?.satisfied(outside)).toBeNull();
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

// #1566: `skipped` carries TWO different facts and the console printed only one of them. A scoped skip
// means the selection held no relevant file; a tier-precondition skip is a WHOLE-tier run, where "no files
// in scope" is simply false — and the reader deciding whether their push was really covered is reading
// this line, not verify.json.
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

// THE POSITIVE CONTROL BUILDS ITS OWN DIFF (#1566 review). The first draft asked the predicate about THIS
// worktree, which answers `true` only while `origin/main` lags local `main` — the moment they are equal
// the merge base is HEAD, the diff is empty, and the arm silently starts asserting `false === true` for a
// reason that has nothing to do with the predicate. A scratch repo with its own `main` and a real commit
// on top of it makes the branch diff a FACT THE TEST OWNS.
function plantBranch(files: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), "orb-precondition-"));
  const git = (...args: readonly string[]): void => {
    const res = runNicedSync("git", ["-C", root, ...args]);
    if (res.status !== 0) {
      throw new Error(`git ${args.join(" ")} failed: ${res.stderr}`);
    }
  };
  git("init", "-b", "main");
  git("config", "user.name", "Precondition Test");
  git("config", "user.email", "precondition@example.invalid");
  writeFileSync(join(root, "seed.txt"), "base\n");
  git("add", "seed.txt");
  git("commit", "-m", "base");
  // HEAD must be AHEAD of the base ref or the merge base IS HEAD and every diff is empty — the same
  // degenerate shape (`origin/main` caught up with local `main`) that made the first draft of this test
  // pass for the wrong reason. `MERGE_BASE_REFS` finds no `origin/main` here and falls back to `main`.
  git("checkout", "-b", "work");
  for (const file of files) {
    const target = join(root, file);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, "changed\n");
  }
  git("add", "-A");
  git("commit", "-m", "branch work");
  return root;
}

test("a branch that DID touch an instrument satisfies the precondition; one that did not does NOT", () => {
  const satisfied = stage("push", "tests:tooling").tierPrecondition?.satisfied;
  expect(satisfied).toBeTypeOf("function");

  // Both arms run against a repo whose base ref and branch commit this test authored, so the answer turns
  // on the PATHS in the diff and nothing else.
  const touched = plantBranch(["tooling/src/snap/cli.ts"]);
  const testsTouched = plantBranch(["tests/tooling/snap/whatever.test.ts"]);
  const untouched = plantBranch(["packages/client/src/app.tsx"]);
  try {
    expect(satisfied?.(touched), "a tooling/** change is a push-tier concern").toBe(true);
    expect(satisfied?.(testsTouched), "a tests/tooling/** change is one too").toBe(true);
    // THE NEGATIVE ARM the old test could never make: a product-only branch cannot regress an instrument
    // test that was green on its base, so the battery moves to --full.
    expect(satisfied?.(untouched), "a product-only change is not").toBe(false);
  } finally {
    for (const root of [touched, testsTouched, untouched]) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
