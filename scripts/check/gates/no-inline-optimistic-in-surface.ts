import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SURFACES_DIR_RE = /\/features\/[^/]+\/surfaces\//;

export const gate: GateDescriptor = {
  name: "no-inline-optimistic-in-surface",
  docRow: "UI-Lib-TanStack-Query.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "Optimistic-mutation plumbing (`cancelQueries` / `setQueryData`) belongs in `features/<x>/hooks/`, not a surface. Surfaces compose JSX; data plumbing drifts when it lives at the call site. Use `optimisticOptions({queryClient, queryKey, merge, invalidateOnSettled})` from `features/_shared` (see docs/architecture/core/UI-Lib-TanStack-Query.md), OR extract a hook that wraps the inline pattern (the wide-TInput tRPC exception — see `use-star-toggle.ts`).",
  scanRoot: (p) => SURFACES_DIR_RE.test(p),
  kinds: [SyntaxKind.CallExpression],
  visit(node, _sf, ctx): void {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const expr = node.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      return;
    }

    const name = expr.getName();
    if (name === "cancelQueries" || name === "setQueryData") {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      why: "optimistic plumbing in a surface",
      files: {
        "src/features/some-feature/surfaces/some-surface.tsx": `
          queryClient.setQueryData(["key"], newData);
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "optimistic plumbing in a hook",
      files: {
        "src/features/some-feature/hooks/some-hook.ts": `
          queryClient.setQueryData(["key"], newData);
        `,
      },
    },
  ],
};
