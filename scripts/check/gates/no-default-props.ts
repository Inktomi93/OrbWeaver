import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const NO_DEFAULT_PROPS_MESSAGE =
  "defaultProps is deprecated in modern React — use default parameters in the component signature instead. (UI-Architecture-and-Layout.md)";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const gate: GateDescriptor = {
  name: "no-default-props",
  docRow: "React modernization — no-default-props",
  status: "active",
  scopeSafety: "incremental-safe",
  message: NO_DEFAULT_PROPS_MESSAGE,
  fix: "move default values to the function signature.",
  scanRoot: (p) => p.startsWith("packages/client/src") || p.startsWith("packages/ui/src") || p.startsWith("packages/server/src"),
  visitFile: (sf, ctx) => {
    for (const node of sf.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
      if (node.getName() === "defaultProps") {
        ctx.report({
          file: relPath(ctx.root, sf.getFilePath()),
          line: node.getStartLineNumber(),
          column: 0,
          token: "defaultProps",
        });
      }
    }
  },
  mustFlag: [
    {
      files: "const MyComponent = (props: any) => <div />;\nMyComponent.defaultProps = { id: 1 };\n",
      at: "packages/ui/src/MyComponent.tsx",
      why: "defaultProps assignment is banned",
    },
  ],
  mustPass: [
    {
      files: "const MyComponent = ({ id = 1 }) => <div />;\n",
      at: "packages/ui/src/MyComponent.tsx",
      why: "default parameter instead of defaultProps",
    },
  ],
};
