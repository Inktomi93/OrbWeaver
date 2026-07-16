import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "no-forward-ref",
  docRow: "Spine-TypeScript-and-Patterns.md §1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "React 19 deprecates `forwardRef`. Pass `ref` as a normal prop instead (e.g. `function MyInput({ ref, ...props })`). Drop the `forwardRef` wrapper. (Spine-TypeScript-and-Patterns.md §1)",
  kinds: [SyntaxKind.CallExpression, SyntaxKind.ImportSpecifier],
  visit(node, _sf, ctx): void {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if ((Node.isIdentifier(expr) && expr.getText() === "forwardRef") || (Node.isPropertyAccessExpression(expr) && expr.getText() === "React.forwardRef")) {
        ctx.report(node);
      }
    } else if (Node.isImportSpecifier(node) && node.getName() === "forwardRef") {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      why: "Using forwardRef from react",
      files: {
        "packages/client/src/feature/ui.tsx": `
          import { forwardRef } from "react";
          export const MyInput = forwardRef((props, ref) => <input ref={ref} />);
        `,
      },
    },
    {
      why: "Using React.forwardRef",
      files: {
        "packages/client/src/feature/ui.tsx": `
          import React from "react";
          export const MyInput = React.forwardRef((props, ref) => <input ref={ref} />);
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "Using ref as a normal prop",
      files: {
        "packages/client/src/feature/ui.tsx": `
          export function MyInput({ ref, value }: { ref: React.Ref<HTMLInputElement>, value: string }) {
            return <input ref={ref} value={value} />;
          }
        `,
      },
    },
  ],
};
