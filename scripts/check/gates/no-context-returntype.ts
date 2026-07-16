import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "no-context-returntype",
  docRow: "Spine-TypeScript-and-Patterns.md §7.4",
  status: "active",
  scopeSafety: "incremental-safe",

  message:
    "`ReturnType<>` in context.ts — the DI bundle type must be an explicit, hand-written interface (read it to know the feature's deps), never reflected off a builder. Write the interface. See Spine-TypeScript-and-Patterns.md §7.4.",
  scanRoot: (p) => p.endsWith("/context.ts"),
  kinds: [SyntaxKind.Identifier],
  visit(node, _sf, ctx): void {
    if (!Node.isIdentifier(node)) {
      return;
    }

    if (node.getText() === "ReturnType") {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      why: "ReturnType in context.ts",
      files: {
        "src/features/chat/context.ts": `
          export type Ctx = ReturnType<typeof makeCtx>;
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "Explicit interface in context.ts",
      files: {
        "src/features/chat/context.ts": `
          export interface Ctx {
            db: Db;
          }
        `,
      },
    },
    {
      why: "ReturnType outside of context.ts",
      files: {
        "src/features/chat/other.ts": `
          export type Ctx = ReturnType<typeof makeCtx>;
        `,
      },
    },
  ],
};
