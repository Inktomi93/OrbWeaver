// The one part of snap's stage ORCHESTRATION that is testable without booting a stack: `tryResolveRef`,
// the ref pre-check the front door exports for sibling tools (#678 — design-audit's `--ref`). It shells
// `git rev-parse` against the real checkout, which is cheap and hermetic (read-only, no worktree, no
// install, no ports). Everything else in ops/stage.ts spins a real stack and stays out of the CI tier —
// the pure derivation half is pinned at tests/tooling/snap/lib/stage-plan.test.ts.
//
// PLANTED CONTROLS, BOTH DIRECTIONS: a resolvable ref must yield a real sha (or the caller's refusal path
// would refuse everything and no isolated audit could ever run), and an unresolvable one must yield null
// (or a typo'd `--ref` silently falls back to auditing the DEV STACK — the defect class #678 exists for).
import { tryResolveRef } from "../../../../tooling/src/snap/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const FULL_SHA_RE = /^[0-9a-f]{40}$/u;

test("HEAD resolves to a full commit sha — the positive control the refusal path rests on", () => {
  expect(tryResolveRef("HEAD")).toMatch(FULL_SHA_RE);
});

test("a ref this checkout cannot name resolves to null, never a fallback", () => {
  expect(tryResolveRef("__orb_no_such_ref_678__")).toBeNull();
});

test("a ref that exists but is not a commit is refused too — a stage serves a TREE at a commit", () => {
  // `HEAD^{tree}` is a real object this repo can name; it is not something a worktree can be checked out
  // at, so the `^{commit}` peel is what makes the check honest rather than a mere existence probe.
  expect(tryResolveRef("HEAD^{tree}")).toBeNull();
});
