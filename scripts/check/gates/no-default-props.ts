// SUPPRESSION: the finding is NODE-anchored and carries `defaultProps` as its token, so
// `// @orb-gate-ignore no-default-props(defaultProps): <reason>` works. It reported through the explicit-
// `Finding` overload until 2026-08-08, which bypasses `hasGateIgnore` by construction (GATE-AUTHORING §1) —
// every marker on this gate was inert and nothing said so.
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const NO_DEFAULT_PROPS_MESSAGE =
  "defaultProps is deprecated in modern React — use default parameters in the component signature instead. (UI-Architecture-and-Layout.md)";

const TOKEN = "defaultProps";

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
      if (node.getName() === TOKEN) {
        ctx.report(node, { token: TOKEN, offset: 0 });
      }
    }
  },
  mustFlag: [
    {
      files: "const MyComponent = (props: any) => <div />;\nMyComponent.defaultProps = { id: 1 };\n",
      at: "packages/ui/src/MyComponent.tsx",
      expect: { count: 1, token: TOKEN },
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
