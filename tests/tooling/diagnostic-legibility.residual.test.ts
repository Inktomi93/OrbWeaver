// RESIDUAL unit test surviving the legacy-oracle burndown (the legacy-oracle burndown report,
// Phase 1). The rest of diagnostic-legibility's coverage moved into its descriptor's mustFlag/mustPass
// conformance examples (run by tests/tooling/gate-conformance.repo.int.test.ts). This ONE assertion did not:
// `hasPointer(text)` is an exported PURE HELPER (a token-matrix over a string), not a dispatch-over-a-tree
// — it cannot be expressed as a gate example (an example proves the gate FIRES/PASSES on a file, not that
// a helper returns a boolean for a given string). So it is retained here, deliberately NAMED
// `.residual.test.ts` (NOT `.int.test.ts`) so the Phase-2 deletion sweep of `tests/tooling/<name>.int.test.ts`
// does not take it; the vitest `unit` lane's `tests/**/*.test.ts` glob still collects it.
import { hasPointer } from "../../tooling/src/verify/gates/diagnostic-legibility.ts";
import { expect, test } from "../support/tool-fixtures.ts";

test("hasPointer accepts doc / code-dir / @orb / concrete-file, rejects bare prose", () => {
  expect(hasPointer("see Spine-Testing.md §5")).toBe(true);
  expect(hasPointer("route through features/chat/hooks/")).toBe(true);
  expect(hasPointer("import from @orb/kit/ids")).toBe(true);
  expect(hasPointer("delete the entry in bus-coverage.ts")).toBe(true);
  expect(hasPointer("just fix it, no pointer here")).toBe(false);
  expect(hasPointer("a bare §7.5 reference resolves to nothing")).toBe(false);
});
