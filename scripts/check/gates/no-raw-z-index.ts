import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//u;
const ALLOWLIST_REGEX = /\/packages\/ui\/src\/(?:layout|markdown)\//u;

const MESSAGE =
  "raw z-N in className — use a semantic z-index token (z-modal, z-popover, z-tooltip, z-overlay, z-toast, z-dropdown, z-sticky). See packages/ui/src/styles/theme.css §z-index tokens and docs/architecture/core/UI-Architecture-and-Layout.md.";

const Z_INDEX_REGEX = /\bz-(?:\d+|\[\d+\])/u;

export const gate: GateDescriptor = {
  name: "no-raw-z-index",
  docRow: "packages/ui/src/styles/theme.css",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Use a semantic z-index token.",
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
    if (Z_INDEX_REGEX.test(text)) {
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
      files: 'const x = <div className="z-50" />;',
      at: "packages/client/src/test.tsx",
      why: "raw z-index class in className",
    },
    {
      files: 'const y = cn("z-[60]");',
      at: "packages/client/src/test.tsx",
      why: "raw z-index class in cn",
    },
  ],
  mustPass: [
    {
      files: 'const x = <div className="z-50" />;',
      at: "packages/ui/src/layout/test.tsx",
      why: "allowlisted path",
    },
    {
      files: 'const x = <div className="z-modal" />;',
      at: "packages/client/src/test.tsx",
      why: "valid intent token",
    },
  ],
};
