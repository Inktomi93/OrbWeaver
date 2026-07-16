import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "persistence-no-in-memory-state",
  docRow: "Core-0-Architecture-and-Structure.md §7",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "Map/Set constructed in a persistence/ file — persistence is queries-only; in-memory state (caches, registries) belongs in a named subsystem, not the query layer (Core-0-Architecture-and-Structure.md §7). Suppress only for a genuine query-local lookup.",
  kinds: [SyntaxKind.NewExpression],
  scanRoot: (p) => p.includes("/persistence/") && !p.includes(".test.") && !p.startsWith("tests/"),
  visit(node, _sf, ctx): void {
    if (Node.isNewExpression(node)) {
      const expr = node.getExpression().getText();
      if (expr === "Map" || expr === "Set" || expr === "WeakMap" || expr === "WeakSet") {
        ctx.report(node);
      }
    }
  },
  mustFlag: [
    {
      why: "new Map in persistence",
      files: {
        "packages/server/src/domain/feature/persistence/x.ts": `
          export const cache = new Map();
        `,
      },
    },
    {
      why: "new Set in persistence",
      files: {
        "packages/server/src/domain/feature/persistence/x.ts": `
          export const cache = new Set();
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "new Map outside persistence",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export const cache = new Map();
        `,
      },
    },
    {
      why: "new Map in persistence test",
      files: {
        "packages/server/src/domain/feature/persistence/x.test.ts": `
          export const cache = new Map();
        `,
      },
    },
  ],
};
