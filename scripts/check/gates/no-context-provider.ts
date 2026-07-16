import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "no-context-provider",
  docRow: "Spine-TypeScript-and-Patterns.md §1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "React 19 deprecates `<Context.Provider>`. You can now render `<Context>` directly. Drop the `.Provider` property access. (Spine-TypeScript-and-Patterns.md §1)",
  kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
  visit(node, _sf, ctx): void {
    if (!(Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node))) {
      return;
    }
    const tagNameNode = node.getTagNameNode();

    if (Node.isPropertyAccessExpression(tagNameNode) && tagNameNode.getName() === "Provider") {
      ctx.report(tagNameNode);
    }
  },
  mustFlag: [
    {
      why: "Using Context.Provider",
      files: {
        "packages/client/src/feature/ui.tsx": `
          export function Host() {
            return <MyContext.Provider value={1}>{children}</MyContext.Provider>;
          }
        `,
      },
    },
    {
      why: "Using Context.Provider self closing",
      files: {
        "packages/client/src/feature/ui.tsx": `
          export function Host() {
            return <MyContext.Provider value={1} />;
          }
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "Using Context directly",
      files: {
        "packages/client/src/feature/ui.tsx": `
          export function Host() {
            return <MyContext value={1}>{children}</MyContext>;
          }
        `,
      },
    },
    {
      why: "Using a normal component",
      files: {
        "packages/client/src/feature/ui.tsx": `
          export function Host() {
            return <MyProvider value={1} />;
          }
        `,
      },
    },
  ],
};
