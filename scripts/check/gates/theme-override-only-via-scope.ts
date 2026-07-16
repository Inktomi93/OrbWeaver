import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SCOPE = /\/packages\/(?:client|ui)\/src\//u;
const EXEMPT_THEME = /\/packages\/ui\/src\/content\/theme-scope\//u;
const EXEMPT_SANDBOX = /\/packages\/ui\/src\/content\/sandbox-frame\//u;

export const gate: GateDescriptor = {
  name: "theme-override-only-via-scope",
  docRow: "UI-Theming-and-Content.md §12.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "inline style overriding a --color-* design token — token overrides go through <ThemeScope> (values clamped at the boundary: parse-as-color, reject url()/expression()/@import; D44 — UI-Theming-and-Content.md §12.1). Never set --color-* in a raw style prop.",
  fix: "use <ThemeScope> to override color tokens",
  scanRoot: (p) => {
    const full = `/${p}`;
    return SCOPE.test(full) && !EXEMPT_THEME.test(full) && !EXEMPT_SANDBOX.test(full);
  },
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, _sf, ctx) => {
    if (!Node.isJsxAttribute(node)) {
      return;
    }
    if (node.getNameNode().getText() === "style" && node.getText().includes("--color-")) {
      ctx.report(node, { token: "style", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const A = () => <div style={{ '--color-primary': 'red' }} />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "inline style overriding a color token",
    },
  ],
  mustPass: [
    {
      files: "export const A = () => <div style={{ width: 10 }} />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "inline style not overriding a color token",
    },
    {
      files: "export const A = () => <div style={{ '--color-primary': 'red' }} />;\n",
      at: "packages/ui/src/content/theme-scope/index.tsx",
      why: "exempt theme scope clamp",
    },
  ],
};
