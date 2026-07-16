import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "no-raw-random",
  docRow: "Spine-Testing.md §3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "ambient Math.random() — determinism: inject a seeded PRNG / the seeded id generator instead (the same seam tests pin). (UI-Gates-and-Lessons.md §11.5)",
  kinds: [SyntaxKind.CallExpression],
  scanRoot: (p) =>
    !(
      p.startsWith("packages/server/src/entry/") ||
      p.endsWith("packages/client/src/main.tsx") ||
      p.includes(".test.") ||
      p.startsWith("tests/") ||
      p.startsWith("scripts/") ||
      p.startsWith("tools/") ||
      p.startsWith("packages/kit/src/ids/") ||
      p.startsWith("packages/kit/src/prng/") ||
      p.startsWith("packages/kit/src/random/")
    ),
  visit(node, _sf, ctx): void {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression().getText();
      if (expr === "Math.random") {
        ctx.report(node);
      }
    }
  },
  mustFlag: [
    {
      why: "ambient Math.random() in production code",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function rollDice() {
            return Math.random();
          }
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "Math.random() in an allowed root (entry)",
      files: {
        "packages/server/src/entry/boot.ts": `
          export function init() {
            return Math.random();
          }
        `,
      },
    },
    {
      why: "Math.random() in a test file",
      files: {
        "tests/server/logic.test.ts": `
          export function runTest() {
            return Math.random();
          }
        `,
      },
    },
    {
      why: "seeded PRNG call",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function rollDice(prng: () => number) {
            return prng();
          }
        `,
      },
    },
  ],
};
