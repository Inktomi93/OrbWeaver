import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SURFACES_DIR_RE = /\/features\/[^/]+\/surfaces\//;

export const gate: GateDescriptor = {
  name: "no-chat-trpc-in-surface",
  docRow: "UI-Architecture-and-Layout.md §2.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "trpc.chat.<verb>.mutationOptions outside the sanctioned verb-hook home — push the verb into features/chat/hooks/use-chat-verbs.ts (or use-chat-injection-verbs.ts / use-draft-chat-actions.ts / use-recent-chats-actions.ts depending on scope), and call the verb from this surface. See UI-Architecture-and-Layout.md §2.1 (surfaces compose; verb dispatch lives in hooks/).",
  scanRoot: (p) => SURFACES_DIR_RE.test(p),
  kinds: [SyntaxKind.PropertyAccessExpression],
  visit(node, _sf, ctx): void {
    if (!Node.isPropertyAccessExpression(node)) {
      return;
    }

    if (node.getName() !== "mutationOptions") {
      return;
    }

    const expr = node.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      return;
    }

    // The expression should be trpc.chat.<verb>
    const innerExpr = expr.getExpression();
    if (!Node.isPropertyAccessExpression(innerExpr)) {
      return;
    }

    if (innerExpr.getName() !== "chat") {
      return;
    }

    const rootExpr = innerExpr.getExpression();
    if (!Node.isIdentifier(rootExpr) || rootExpr.getText() !== "trpc") {
      return;
    }

    ctx.report(node);
  },
  mustFlag: [
    {
      why: "trpc.chat.<verb>.mutationOptions in surface",
      files: {
        "src/features/chat/surfaces/some-surface.tsx": `
          trpc.chat.send.mutationOptions(...)
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "trpc.chat.<verb>.mutationOptions in hook",
      files: {
        "src/features/chat/hooks/use-chat-verbs.ts": `
          trpc.chat.send.mutationOptions(...)
        `,
      },
    },
  ],
};
