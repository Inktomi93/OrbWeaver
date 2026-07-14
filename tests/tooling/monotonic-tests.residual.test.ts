// RESIDUAL unit test surviving the legacy-oracle burndown (reports/tooling/LEGACY-ORACLE-BURNDOWN.md
// Phase 1). monotonic-tests tooth 1 (the forbidden-skip AST scan — every FLAG/PASS shape) moved into its
// descriptor's mustFlag/mustPass conformance examples. Tooth 2 — the deleted-baseline-manifest reconciliation
// — did NOT: it reads a committed `docs/test-baseline/manifest.json` off DISK and flags a listed test file
// that no longer exists. Proving the FLAG needs a real temp-dir tree with a manifest.json present, but the
// descriptor is NOT declared `fsBacked` (tooth 1 is pure AST; tooth 2 gracefully no-ops when the manifest is
// absent, as on the real tree today) — so the gate-conformance runner materializes no disk for it and the
// deleted-file arm is un-expressible as a gate example. It is retained here, deliberately NAMED
// `.residual.test.ts` (NOT `.int.test.ts`) so the Phase-2 deletion sweep of `tests/tooling/<name>.int.test.ts`
// does not take it; the vitest `unit` lane's `tests/**/*.test.ts` glob still collects it. (The no-baseline
// no-op arm is already covered by every tooth-1 conformance example, which runs tooth 2 with no manifest.)
import { monotonicTests } from "../../scripts/check/gates/monotonic-tests.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxAt, withTree } from "./_support.ts";

const NO_LONGER_EXISTS_RE = /no longer exists/u;

test("tooth 2 fires when a manifest-listed test file no longer exists on disk", () => {
  withTree(
    {
      "docs/test-baseline/manifest.json": JSON.stringify({
        testFiles: ["tests/server/gone.test.ts"],
      }),
    },
    (root) => {
      const violations = monotonicTests.run(ctxAt(root));
      expect(
        violations.some(
          (v) => v.file === "tests/server/gone.test.ts" && NO_LONGER_EXISTS_RE.test(v.message),
        ),
      ).toBe(true);
    },
  );
});
