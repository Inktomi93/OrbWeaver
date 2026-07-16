import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const METHODS = new Set(["invalidateQueries", "setQueryData", "cancelQueries", "getQueryData", "removeQueries", "resetQueries"]);
const TEST_FILE_RE = /\.(test|spec)\.tsx?$/;

export const gate: GateDescriptor = {
  name: "client-cache-surgery-only-in-data",
  docRow: "UI-Gates-and-Lessons.md §11.3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "imperative QueryClient cache call outside client data/ — invalidation goes through the central seam (data/invalidation.ts invalidate(event)/invalidateFilters) and optimistic writes through createEntityMutation; a loose cache call here recreates neo's 81-site invalidation sprawl. See UI-Gates-and-Lessons.md §11.3.",
  scanRoot: (p) => {
    if (!p.includes("packages/client/src/")) {
      return false;
    }
    if (p.includes("packages/client/src/data/")) {
      return false;
    }
    if (TEST_FILE_RE.test(p)) {
      return false;
    }
    return true;
  },
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
    if (METHODS.has(name)) {
      ctx.report(expr.getNameNode());
    }
  },
  mustFlag: [
    {
      why: "imperative QueryClient cache call outside client data/",
      files: {
        "packages/client/src/features/some-feature/surface.tsx": `
          client.invalidateQueries();
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "imperative QueryClient cache call in client data/",
      files: {
        "packages/client/src/data/some-file.ts": `
          client.invalidateQueries();
        `,
      },
    },
    {
      why: "other method call",
      files: {
        "packages/client/src/features/some-feature/surface.tsx": `
          client.someOtherMethod();
        `,
      },
    },
  ],
};
