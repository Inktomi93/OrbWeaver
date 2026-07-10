// Self-test for the DORMANT `surface-in-a-container` gate (scripts/check/gates/surface-in-a-container.ts
// — NOT in report.ts's ALL_CHECKS; deferred-with-construct, no consumer-surface exists on the real tree
// yet + containment is anchor-provided/cross-file — see the gate header). Drives the Check over a REAL
// temp-dir fixture tree (the gate reads surface files via readFileSync), never the real repo tree,
// proving fire (a surface with a raw structural root + no Container) AND no-false-positive (a surface
// that renders a Container; the app-shell shell-tier exemption).
import { surfaceInAContainer } from "../../scripts/check/gates/surface-in-a-container.ts";
import { expect, test } from "../support/fixtures.ts";
import { ctxAt, withTree } from "./_support.ts";

const S = "packages/client/src/features";

test("fires on a surface with a raw structural root and no Container", () => {
  withTree(
    { [`${S}/character/surfaces/grid-surface.tsx`]: "export const G = () => <div>x</div>;\n" },
    (root) => {
      const v = surfaceInAContainer.run(ctxAt(root));
      expect(v.some((x) => x.file.endsWith("grid-surface.tsx"))).toBe(true);
    },
  );
});

test("does NOT fire when the surface renders a <Container>", () => {
  withTree(
    {
      [`${S}/character/surfaces/grid-surface.tsx`]:
        "export const G = () => <Container><ul>x</ul></Container>;\n",
    },
    (root) => {
      expect(surfaceInAContainer.run(ctxAt(root))).toEqual([]);
    },
  );
});

test("does NOT fire when the surface renders only text / a single composed child (no structural root)", () => {
  withTree(
    { [`${S}/character/surfaces/name-surface.tsx`]: "export const N = () => <Name />;\n" },
    (root) => {
      expect(surfaceInAContainer.run(ctxAt(root))).toEqual([]);
    },
  );
});

test("exempts the app-shell shell tier (the container PROVIDER frame)", () => {
  withTree(
    { [`${S}/app-shell/surfaces/app-shell.tsx`]: "export const A = () => <Stack>x</Stack>;\n" },
    (root) => {
      expect(surfaceInAContainer.run(ctxAt(root))).toEqual([]);
    },
  );
});
