import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const TEST_FILE_REGEX = /\.(test|spec)\.tsx?$/;
const IS_GROUP_REGEX = /^(?:isGroup|isGroupChat|isGroupMode|is_group)$/;

export const gate: GateDescriptor = {
  name: "no-if-is-group",
  docRow: "Core-Laws-and-Precedents.md §7 D16",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "`isGroup`-style boolean branches on group-vs-solo identity — the design forbids it (solo is the degenerate case of group). Gate on explicit roster/cast size that NO-OPS at roster=1 (so byte-identity holds). See Core-Laws-and-Precedents.md §7 D16 (unified group chat).",
  scanRoot: (p) => !(p.includes("tests/") || p.includes("tools/") || p.includes("scripts/") || TEST_FILE_REGEX.test(p)),
  kinds: [SyntaxKind.VariableDeclaration, SyntaxKind.Identifier],
  visit(node, _sf, ctx): void {
    if (Node.isVariableDeclaration(node)) {
      const name = node.getName();
      if (IS_GROUP_REGEX.test(name)) {
        ctx.report(node);
      }
    } else if (Node.isIdentifier(node)) {
      const name = node.getText();
      if (IS_GROUP_REGEX.test(name)) {
        // We only care if it's used in an IfStatement or ConditionalExpression (ternary)
        // Check the parent chain
        const parent = node.getParent();
        if (!parent) {
          return;
        }

        if ((Node.isIfStatement(parent) && parent.getExpression() === node) || (Node.isConditionalExpression(parent) && parent.getCondition() === node)) {
          ctx.report(node);
        }
      }
    }
  },
  mustFlag: [
    {
      why: "const isGroup",
      files: `
        const isGroup = true;
      `,
    },
    {
      why: "if (isGroup)",
      files: `
        if (isGroup) { doSomething(); }
      `,
    },
    {
      why: "ternary isGroup",
      files: `
        const x = isGroup ? a : b;
      `,
    },
  ],
  mustPass: [
    {
      why: "length > 1",
      files: `
        if (speakers.length > 1) { doSomething(); }
      `,
    },
    {
      why: "tests exemption",
      files: {
        "src/foo.test.ts": "const isGroup = true;",
      },
    },
  ],
};
