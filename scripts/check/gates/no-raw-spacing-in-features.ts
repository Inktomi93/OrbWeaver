import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//u;
const ALLOWLIST_REGEX = /\/packages\/ui\/src\/(?:layout|markdown)\//u;

const MESSAGE =
  "raw spacing utility in className — use a layout primitive (<Stack>, <Row>, <Section>, <Toolbar>) or an intent token (gap-section, p-row, py-block, gap-gutter). See docs/architecture/core/UI-Architecture-and-Layout.md.";

const SPACING_REGEX = /\b(?:gap|p[xytrbl]?|m[xytrbl]?|space-[xy])-(?:[1-9]\d*|\d+\.\d+|\[[^\]]+\])/u;

export const gate: GateDescriptor = {
  name: "no-raw-spacing-in-features",
  docRow: "docs/architecture/core/UI-Architecture-and-Layout.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Use layout primitives or intent tokens instead of raw spacing classes.",
  scanRoot: (p) => {
    const path = `/${p}`;
    if (!SCOPE_REGEX.test(path)) {
      return false;
    }
    if (ALLOWLIST_REGEX.test(path)) {
      return false;
    }
    return true;
  },
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
  visit: (node, _sf, ctx) => {
    if (!(Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) {
      return;
    }
    const text = node.getText();
    if (SPACING_REGEX.test(text)) {
      let inScope = false;
      const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
      if (jsxAttr && jsxAttr.getNameNode().getText() === "className") {
        inScope = true;
      } else {
        const callExpr = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
        if (callExpr) {
          const expr = callExpr.getExpression().getText();
          if (["cn", "clsx", "cva", "tv"].includes(expr)) {
            inScope = true;
          }
        }
      }
      if (inScope) {
        ctx.report(node, { token: text, offset: 0 });
      }
    }
  },
  mustFlag: [
    {
      files: 'const x = <div className="p-4" />;',
      at: "packages/client/src/test.tsx",
      why: "raw spacing class in className",
    },
    {
      files: 'const y = cn("gap-2", "text-black");',
      at: "packages/client/src/test.tsx",
      why: "raw spacing class in cn",
    },
  ],
  mustPass: [
    {
      files: 'const x = <div className="p-4" />;',
      at: "packages/ui/src/layout/test.tsx",
      why: "allowlisted path",
    },
    {
      files: 'const x = <div className="p-row" />;',
      at: "packages/client/src/test.tsx",
      why: "valid intent token",
    },
  ],
};
