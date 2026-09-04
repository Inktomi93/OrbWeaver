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
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import type { StageDef } from "../../../../tooling/src/verify/contract/stage.ts";
import { stagesForTier } from "../../../../tooling/src/verify/lib/registry.ts";
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

test("a checkout that DID touch an instrument satisfies the precondition — this very worktree", ({ repoRoot }) => {
  // The positive control for the arm above: this lane's own branch touches tooling/** by construction, so
  // a `true` here proves the predicate can answer at all rather than only ever returning null.
  expect(stage("push", "tests:tooling").tierPrecondition?.satisfied(repoRoot)).toBe(true);
});
