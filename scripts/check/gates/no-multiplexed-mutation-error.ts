import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "multiplexed mutation errors — v5 errors are sticky until the next mutate, so this leaks one action's stale failure into another's surface. One error slot per mutation (createEntityMutation's { error, clearError }). See UI-Gates-and-Lessons.md §11.1.";

export const gate: GateDescriptor = {
  name: "no-multiplexed-mutation-error",
  docRow: "UI-Gates-and-Lessons.md §11.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "render each mutation's own .error, or use createEntityMutation's per-mutation { error, clearError } channel",
  scanRoot: (p) => p.includes("packages/client/src/") && !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"),
  kinds: [SyntaxKind.BinaryExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isBinaryExpression(node)) {
      return;
    }
    const operator = node.getOperatorToken().getKind();
    if (operator !== SyntaxKind.QuestionQuestionToken && operator !== SyntaxKind.BarBarToken) {
      return;
    }

    const left = node.getLeft();
    const right = node.getRight();

    if (Node.isPropertyAccessExpression(left) && Node.isPropertyAccessExpression(right) && left.getName() === "error" && right.getName() === "error") {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      files: "export const G = a.error ?? b.error;\n",
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "multiplexed mutation error using ??",
    },
    {
      files: "export const G = a.error || b.error;\n",
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "multiplexed mutation error using ||",
    },
  ],
  mustPass: [
    {
      files: "export const G = a.error;\n",
      at: "packages/client/src/features/x/x.tsx",
      why: "single error",
    },
  ],
};
