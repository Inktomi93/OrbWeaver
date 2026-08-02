// RESIDUAL unit test surviving the legacy-oracle burndown (reports/tooling/LEGACY-ORACLE-BURNDOWN.md
// Phase 1). monotonic-tests tooth 1 (the forbidden-skip AST scan — every FLAG/PASS shape) moved into its
// descriptor's mustFlag/mustPass conformance examples. Tooth 2 — the deleted-baseline-manifest reconciliation
// — did NOT: it reads a committed `docs/test-baseline/manifest.json` off DISK and flags a listed test file
// that no longer exists (and isn't ledgered), a missing/malformed manifest on the real tree, or a stale
// `deletions` ledger row. Proving these needs a real temp-dir tree — a manifest.json (or its deliberate
// absence) plus, for the fail-loud/stale arms, the `REAL_TREE_ANCHOR` file that tells the gate "this is a
// real checkout" — but the descriptor is NOT declared `fsBacked` (tooth 1 is pure AST) so the
// gate-conformance runner materializes no disk for it and these arms are un-expressible as gate examples.
// Retained here, deliberately NAMED `.residual.test.ts` (NOT `.int.test.ts`) so the Phase-2 deletion sweep
// of `tests/tooling/<name>.int.test.ts` does not take it; the vitest `unit` lane's `tests/**/*.test.ts`
// glob still collects it. (The no-manifest-on-a-non-real-tree no-op arm is already covered by every
// tooth-1 conformance example, which runs tooth 2 against a virtual `/repo` root with no anchor either.)
import { monotonicTests } from "../../scripts/check/gates/monotonic-tests.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxAt, withTree } from "./_support.ts";

const NO_LONGER_EXISTS_RE = /no longer exists/u;
const MISSING_MANIFEST_RE = /manifest is missing/u;
const STALE_ENTRY_RE = /stale `deletions` ledger entry/u;
const REGEN_COMMAND_RE = /gen-test-baseline-manifest\.ts/u;
// Present on every real checkout; a withTree fixture must plant it to simulate "this is the real repo" for
// the fail-loud/stale arms (mirrors the gate's own REAL_TREE_ANCHOR).
const ANCHOR_FILES = { "packages/db/src/schema/index.ts": "export const anchor = 1;\n" };

test("tooth 2 fires when a manifest-listed test file no longer exists on disk and isn't ledgered", () => {
  withTree(
    {
      "docs/test-baseline/manifest.json": JSON.stringify({
        testFiles: ["tests/server/gone.test.ts"],
        deletions: {},
      }),
    },
    (root) => {
      const violations = monotonicTests.run(ctxAt(root));
      expect(violations.some((v) => v.file === "tests/server/gone.test.ts" && NO_LONGER_EXISTS_RE.test(v.message))).toBe(true);
    },
  );
});

test("tooth 2 passes when the missing file is accounted for in the deletions ledger", () => {
  withTree(
    {
      "docs/test-baseline/manifest.json": JSON.stringify({
        testFiles: ["tests/server/gone.test.ts"],
        deletions: { "tests/server/gone.test.ts": { why: "merged into tests/server/kept.test.ts — see PD-999" } },
      }),
    },
    (root) => {
      const violations = monotonicTests.run(ctxAt(root));
      expect(violations.some((v) => v.file === "tests/server/gone.test.ts")).toBe(false);
    },
  );
});

test("tooth 2 fail-loud: a missing manifest reds on a real-tree checkout, naming the regen command", () => {
  withTree(ANCHOR_FILES, (root) => {
    const violations = monotonicTests.run(ctxAt(root));
    const hit = violations.find((v) => v.file === "docs/test-baseline/manifest.json" && MISSING_MANIFEST_RE.test(v.message));
    expect(hit?.message).toMatch(REGEN_COMMAND_RE);
  });
});

test("tooth 2 fail-loud stays silent when the tree isn't real (no anchor) — the conformance-safety case", () => {
  withTree({}, (root) => {
    const violations = monotonicTests.run(ctxAt(root));
    expect(violations.some((v) => v.file === "docs/test-baseline/manifest.json")).toBe(false);
  });
});

test("tooth 2 stale ledger: a deletions entry whose file has come back to disk is itself RED", () => {
  withTree(
    {
      ...ANCHOR_FILES,
      "tests/server/back.test.ts": 'test("still here", () => {});\n',
      "docs/test-baseline/manifest.json": JSON.stringify({
        testFiles: ["tests/server/back.test.ts"],
        deletions: { "tests/server/back.test.ts": { why: "thought it was gone" } },
      }),
    },
    (root) => {
      const violations = monotonicTests.run(ctxAt(root));
      expect(violations.some((v) => v.file === "tests/server/back.test.ts" && STALE_ENTRY_RE.test(v.message))).toBe(true);
    },
  );
});
