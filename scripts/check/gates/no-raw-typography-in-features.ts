import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//u;
const ALLOWLIST_REGEX = /\/packages\/ui\/src\/(?:layout|markdown)\//u;

const MESSAGE =
  "raw font-size utility in className — use a typography intent token (text-micro, text-label, text-body, text-hint, text-mono-tag). See docs/architecture/core/UI-Architecture-and-Layout.md.";

const TYPOGRAPHY_REGEX = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[[^\]]+\])/u;

export const gate: GateDescriptor = {
  name: "no-raw-typography-in-features",
  docRow: "docs/architecture/core/UI-Architecture-and-Layout.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Use a typography intent token instead of raw text-size classes.",
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
    if (TYPOGRAPHY_REGEX.test(text)) {
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
      files: 'const x = <div className="text-sm" />;',
      at: "packages/client/src/test.tsx",
      why: "raw typography class in className",
    },
    {
      files: 'const y = cn("text-xl", "font-bold");',
      at: "packages/client/src/test.tsx",
      why: "raw typography class in cn",
    },
  ],
  mustPass: [
    {
      files: 'const x = <div className="text-sm" />;',
      at: "packages/ui/src/layout/test.tsx",
      why: "allowlisted path",
    },
    {
      files: 'const x = <div className="text-body" />;',
      at: "packages/client/src/test.tsx",
      why: "valid intent token",
    },
  ],
};
