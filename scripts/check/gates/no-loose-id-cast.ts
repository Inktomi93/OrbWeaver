import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const ID_REGEX = /^[A-Z][A-Za-z0-9]*Id$/;
const TEST_FILE_REGEX = /\.(test|spec)\.tsx?$/;

export const gate: GateDescriptor = {
  name: "no-loose-id-cast",
  docRow: "Spine-TypeScript-and-Patterns.md §4",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "`as never` launders a value past ALL type checks. For a branded-ID parameter use the typed helper from @orb/kit/ids (castId / brandedId / parseId). For a genuine ORM/library escape, suppress WITH a reason. See Spine-TypeScript-and-Patterns.md.",
  scanRoot: (p) => !(p.includes("tests/") || p.includes("tools/") || p.includes("scripts/") || TEST_FILE_REGEX.test(p)),
  kinds: [SyntaxKind.AsExpression],
  visit(node, _sf, ctx): void {
    if (!Node.isAsExpression(node)) {
      return;
    }

    const typeNode = node.getTypeNode();
    if (!typeNode) {
      return;
    }
    const typeText = typeNode.getText().trim();

    if (typeText === "never") {
      ctx.report(node);
      return;
    }

    // Check for `expr as unknown as <SomethingId>`
    // The AST for this is actually an AsExpression where the expression is another AsExpression
    // e.g. `(expr as unknown) as SomethingId`
    // Wait, let's check if the inner type is unknown and the outer type ends with Id
    if (ID_REGEX.test(typeText)) {
      const expr = node.getExpression();
      if (Node.isAsExpression(expr)) {
        const innerTypeNode = expr.getTypeNode();
        if (innerTypeNode?.getText().trim() === "unknown") {
          ctx.report(node);
        }
      }
    }
  },
  mustFlag: [
    {
      why: "as never",
      files: `
        const x = y as never;
      `,
    },
    {
      why: "as unknown as SomethingId",
      files: `
        const x = y as unknown as UserId;
      `,
    },
  ],
  mustPass: [
    {
      why: "castId helper",
      files: `
        const x = castId<UserId>(y);
      `,
    },
    {
      why: "as never in test file",
      files: {
        "src/foo.test.ts": "const x = y as never;",
      },
    },
  ],
};
