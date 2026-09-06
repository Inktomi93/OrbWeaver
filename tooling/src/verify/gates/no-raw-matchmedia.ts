import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";

const MESSAGE =
  "raw matchMedia call outside the one-home media-query libs — use `usePrefersReducedMotion()` (render, live-updating), `prefersReducedMotionNow()` (imperative, point-in-time), or `coarsePointerNow()` (imperative, point-in-time pointer-coarseness) from `@orb/ui`'s `#lib` instead of forking matchMedia plumbing. See docs/architecture/core/UI-Gates-and-Lessons.md §11.";

export const gate: GateDescriptor = {
  name: "no-raw-matchmedia",
  docRow: "UI-Gates-and-Lessons.md §11",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "use usePrefersReducedMotion() or prefersReducedMotionNow()",
  scanRoot: (p) => {
    if (p.includes("packages/ui/src/lib/use-prefers-reduced-motion.ts")) {
      return false;
    }
    if (p.includes("packages/ui/src/lib/reduced-motion-now.ts")) {
      return false;
    }
    if (p.includes("use-is-mobile-viewport.ts")) {
      return false;
    }
    if (p.includes("packages/ui/src/lib/coarse-pointer-now.ts")) {
      return false;
    }
    return p.includes("packages/client/src/") || p.includes("packages/ui/src/");
  },
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const expr = node.getExpression();
    if (Node.isPropertyAccessExpression(expr) && expr.getName() === "matchMedia") {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      files: 'export const G = window.matchMedia("(prefers-reduced-motion: reduce)");\n',
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "raw matchMedia",
    },
    {
      files: 'export const G = window.matchMedia?.("(prefers-reduced-motion: reduce)");\n',
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "optional chained matchMedia",
    },
  ],
  mustPass: [
    {
      files: 'export const G = window.matchMedia("(prefers-reduced-motion: reduce)");\n',
      at: "packages/ui/src/lib/use-prefers-reduced-motion.ts",
      why: "allowed in this file",
    },
    {
      files: 'export const G = window.matchMedia("(pointer: coarse)");\n',
      at: "packages/ui/src/lib/coarse-pointer-now.ts",
      why: "allowed in this file — the coarsePointerNow() one-home",
    },
  ],
};
