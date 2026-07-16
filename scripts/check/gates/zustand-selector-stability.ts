import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const EXEMPT_TEST = /\.test\.tsx?$/u;
const STORE_REGEX = /^use[A-Z].*Store$/;

export const gate: GateDescriptor = {
  name: "zustand-selector-stability",
  docRow: "UI-Lib-Zustand.md C-1/B-2",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "zustand selector returns a fresh object/array literal — under v5's Object.is this re-renders forever (useSyncExternalStore loop). Select a stored ref, use a frozen module-constant default, or wrap in useShallow. See UI-Lib-Zustand.md C-1/B-2.",
  fix: "select a stored ref, use a frozen module-constant default, or wrap in useShallow.",
  scanRoot: (p) => !EXEMPT_TEST.test(`/${p}`),
  kinds: [SyntaxKind.CallExpression],
  visit: (node, _sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const exprText = node.getExpression().getText();
    if (!STORE_REGEX.test(exprText)) {
      return;
    }
    const args = node.getArguments();
    if (args.length === 0) {
      return;
    }
    const firstArg = args[0];
    if (Node.isArrowFunction(firstArg)) {
      const body = firstArg.getBody();
      if (Node.isParenthesizedExpression(body)) {
        const inner = body.getExpression();
        if (Node.isObjectLiteralExpression(inner) || Node.isArrayLiteralExpression(inner)) {
          ctx.report(firstArg, { token: exprText, offset: 0 });
        }
      } else if (Node.isObjectLiteralExpression(body) || Node.isArrayLiteralExpression(body)) {
        ctx.report(firstArg, { token: exprText, offset: 0 });
      }
    }
  },
  mustFlag: [
    {
      files: "export const useUserStore = () => {}; const A = () => useUserStore(s => ({ a: 1 }));\n",
      at: "packages/client/src/components/foo.tsx",
      why: "selector returning object literal",
    },
    {
      files: "export const useUserStore = () => {}; const A = () => useUserStore(s => [1, 2]);\n",
      at: "packages/client/src/components/foo.tsx",
      why: "selector returning array literal",
    },
  ],
  mustPass: [
    {
      files: "export const useUserStore = () => {}; const A = () => useUserStore(s => s.user);\n",
      at: "packages/client/src/components/foo.tsx",
      why: "selector returning property access",
    },
    {
      files: "export const useUserStore = () => {}; const A = () => useUserStore(s => ({ a: 1 }));\n",
      at: "packages/client/src/components/foo.test.tsx",
      why: "exempt in tests",
    },
  ],
};
