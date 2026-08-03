// Gate: no-use-context — React 19 replaced `useContext(Context)` with the `use(Context)` hook; keeping the
// legacy reader splits one read into two spellings and forfeits `use`'s conditional/suspense-aware call
// position, which is what the migration was for. Sibling of no-forward-ref / no-context-provider.
// ARMS: a bare `useContext(…)` call · a `React.useContext(…)` member call · an ImportSpecifier named
// `useContext` from "react". No exemptions — the replacement is total. DECLARED LIMIT: none (all three doors).
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "no-use-context",
  docRow: "Spine-TypeScript-and-Patterns.md §1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "React 19 deprecates `useContext`. Read the context with the `use` hook instead — `const v = use(MyContext)` — which also works in a conditional position. Drop the `useContext` import. (Spine-TypeScript-and-Patterns.md §1)",
  kinds: [SyntaxKind.CallExpression, SyntaxKind.ImportSpecifier],
  visit(node, _sf, ctx): void {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if ((Node.isIdentifier(expr) && expr.getText() === "useContext") || (Node.isPropertyAccessExpression(expr) && expr.getText() === "React.useContext")) {
        ctx.report(node);
      }
    } else if (Node.isImportSpecifier(node) && node.getName() === "useContext") {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      why: "the founding shape — a bare useContext() read (the import fires too, so the whole legacy spelling reds at once)",
      files: {
        "packages/client/src/feature/ui.tsx": `
          import { useContext } from "react";
          export function useTheme() {
            return useContext(ThemeContext);
          }
        `,
      },
      expect: { count: 2 },
    },
    {
      why: "the MEMBER arm — a namespace React import carries no ImportSpecifier, so React.useContext's only door is the call site",
      files: {
        "packages/client/src/feature/ui.tsx": `
          import React from "react";
          export function useTheme() {
            return React.useContext(ThemeContext);
          }
        `,
      },
      expect: { count: 1 },
    },
    {
      why: "the IMPORT arm alone — a useContext binding imported but not yet called is already the legacy spelling entering the file",
      files: {
        "packages/client/src/feature/ui.tsx": `
          import { useContext } from "react";
          export const reader = useContext;
        `,
      },
      expect: { count: 1 },
    },
  ],
  mustPass: [
    {
      why: "the React 19 replacement this gate exists to drive traffic to — `use(Context)`, callable in a conditional position",
      files: {
        "packages/client/src/feature/ui.tsx": `
          import { use } from "react";
          export function useTheme() {
            return use(ThemeContext);
          }
        `,
      },
    },
    {
      why: "`createContext` is untouched — React 19 deprecated the READER and `<Context.Provider>` (no-context-provider's arm), never the context itself",
      files: {
        "packages/client/src/feature/ui.tsx": `
          import { createContext } from "react";
          export const ThemeContext = createContext<string | null>(null);
        `,
      },
    },
  ],
};
