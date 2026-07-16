import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const SCOPE = /\/packages\/(?:client|ui)\/src\//u;
const EXEMPT_MARKDOWN = /\/packages\/ui\/src\/markdown\//u;
const EXEMPT_SANDBOX = /\/packages\/ui\/src\/content\/sandbox-frame\//u;

export const gate: GateDescriptor = {
  name: "no-untrusted-html-in-main-dom",
  docRow: "UI-Theming-and-Content.md §12.2",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "dangerouslySetInnerHTML in the app DOM — untrusted HTML MUST go through <SandboxFrame> (sandboxed iframe + per-frame CSP) or the sanitized @orb/ui/markdown seal (D44 — UI-Theming-and-Content.md §12.2). Never inject raw HTML into the main document.",
  fix: "use <SandboxFrame> or the @orb/ui/markdown seal",
  scanRoot: (p) => {
    const full = `/${p}`;
    return SCOPE.test(full) && !EXEMPT_MARKDOWN.test(full) && !EXEMPT_SANDBOX.test(full);
  },
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, _sf, ctx) => {
    if (!Node.isJsxAttribute(node)) {
      return;
    }
    if (node.getNameNode().getText() === "dangerouslySetInnerHTML") {
      ctx.report(node, { token: "dangerouslySetInnerHTML", offset: 0 });
    }
  },
  mustFlag: [
    {
      files: "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "dangerouslySetInnerHTML used outside sanctioned seals",
    },
  ],
  mustPass: [
    {
      files: "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
      at: "packages/ui/src/markdown/index.tsx",
      why: "exempt markdown seal",
    },
    {
      files: "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
      at: "packages/ui/src/content/sandbox-frame/index.tsx",
      why: "exempt sandbox seal",
    },
  ],
};
