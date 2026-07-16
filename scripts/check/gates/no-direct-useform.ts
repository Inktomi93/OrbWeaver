import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const METHODS = new Set(["useForm", "createFormHook", "createFormHookContexts"]);

export const gate: GateDescriptor = {
  name: "no-direct-useform",
  docRow: "UI-Lib-TanStack-Form.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "Use `useAppForm` (and `withForm` / `withFieldGroup`) from `#forms` instead of TanStack Form's `useForm` / `createFormHook` / `createFormHookContexts` directly. The shared instance pre-binds the @orb/ui Field components; calling these directly bypasses the bound fields and drifts every editor surface apart. See docs/architecture/core/UI-Lib-TanStack-Form.md.",
  scanRoot: (p) => !p.includes("packages/client/src/forms/"),
  kinds: [SyntaxKind.CallExpression],
  visit(node, _sf, ctx): void {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const expr = node.getExpression();
    if (!Node.isIdentifier(expr)) {
      return;
    }

    if (METHODS.has(expr.getText())) {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      why: "useForm outside shared toolkit",
      files: {
        "src/features/some-feature/surface.tsx": `
          useForm(...)
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "useForm inside shared toolkit",
      files: {
        "packages/client/src/forms/use-app-form.ts": `
          useForm(...)
        `,
      },
    },
  ],
};
