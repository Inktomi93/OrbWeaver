// Self-test for the DORMANT `component-size-ui` gate (scripts/check/gates/component-size-ui.ts — NOT
// in report.ts's ALL_CHECKS; it finds real debt (table.tsx) whose backfill+activation rides W1-1).
// Drives the Check directly over a REAL temp-dir fixture tree (the gate line-counts via readFileSync,
// so it needs real fs), never the real repo tree, proving fire (a 451-line file) AND no-false-positive
// (a 450-line file at the boundary; a CT/test file exempt at any size). `.int.test.ts` because it does
// real fs I/O (mkdtemp/writeFile) — matching check-gates.int.test.ts's precedent for gate self-tests.
import { componentSizeUi } from "../../scripts/check/gates/component-size-ui.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxAt, withTree } from "./_support.ts";

const line = "const x = 1;\n";

test("fires on a @orb/ui source over the 450-line cap", () => {
  withTree({ "packages/ui/src/primitives/big/big.tsx": line.repeat(451) }, (root) => {
    const v = componentSizeUi.run(ctxAt(root));
    expect(v.some((x) => x.file.endsWith("big/big.tsx") && x.message.includes("cap 450"))).toBe(
      true,
    );
  });
});

test("does NOT fire at exactly the cap (450 lines)", () => {
  withTree({ "packages/ui/src/primitives/edge/edge.tsx": line.repeat(450) }, (root) => {
    expect(componentSizeUi.run(ctxAt(root))).toEqual([]);
  });
});

test("exempts test / CT / fixture / .d.ts files at any size", () => {
  withTree(
    {
      "packages/ui/src/primitives/x/x.ct.tsx": line.repeat(600),
      "packages/ui/src/primitives/x/x.fixtures.tsx": line.repeat(600),
      "packages/ui/src/primitives/x/x.d.ts": line.repeat(600),
    },
    (root) => {
      expect(componentSizeUi.run(ctxAt(root))).toEqual([]);
    },
  );
});
