import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "hand-rolled `.length / 4` token estimate — @orb/kit/tokens is the ONE estimator: import { estimateTokens } and call estimateTokens(text). A flat length/4 undercounts CJK/emoji ~4× and silently overflows token budgets. See packages/kit/src/tokens/index.ts.";

export const gate: GateDescriptor = {
  name: "no-manual-token-estimate",
  docRow: "packages/kit/src/tokens/index.ts",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: 'import { estimateTokens } from "@orb/kit/tokens" and use it',
  scanRoot: (p) => {
    if (p.includes("/tests/") || p.endsWith(".test.ts") || p.endsWith(".test.tsx")) {
      return false;
    }
    return p.includes("packages/client/src/") || p.includes("packages/ui/src/") || p.includes("packages/server/src/");
  },
  kinds: [SyntaxKind.BinaryExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isBinaryExpression(node)) {
      return;
    }
    if (node.getOperatorToken().getKind() !== SyntaxKind.SlashToken) {
      return;
    }
    const right = node.getRight();
    if (right.getKind() !== SyntaxKind.NumericLiteral || right.getText() !== "4") {
      return;
    }

    const left = node.getLeft();
    if (Node.isPropertyAccessExpression(left) && left.getName() === "length") {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      files: "export const G = text.length / 4;\n",
      at: "packages/server/src/domain/x/verb.ts",
      expect: { count: 1 },
      why: ".length / 4 used",
    },
  ],
  mustPass: [
    {
      files: "export const G = estimateTokens(text);\n",
      at: "packages/server/src/domain/x/verb.ts",
      why: "using the official estimator",
    },
  ],
};
