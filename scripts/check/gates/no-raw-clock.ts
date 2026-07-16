import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "no-raw-clock",
  docRow: "Spine-Testing.md §3",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "raw Date.now() / new Date() — production reads time from the injected clock (@orb/kit/time), never ambient now (determinism: the same seam tests use). `new Date(ms)` to parse a known timestamp is fine. (Spine-Testing.md §3)",
  kinds: [SyntaxKind.CallExpression, SyntaxKind.NewExpression],
  scanRoot: (p) =>
    !(
      p.startsWith("packages/kit/src/time/") ||
      p.startsWith("packages/server/src/entry/") ||
      p.includes(".test.") ||
      p.startsWith("tests/") ||
      p.startsWith("scripts/") ||
      p.startsWith("tools/")
    ),
  visit(node, _sf, ctx): void {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression().getText();
      if (expr === "Date.now") {
        ctx.report(node);
      }
      return;
    }

    if (Node.isNewExpression(node)) {
      const expr = node.getExpression().getText();
      if (expr === "Date" && node.getArguments().length === 0) {
        ctx.report(node);
      }
    }
  },
  mustFlag: [
    {
      why: "Date.now() call",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function doThing() {
            return Date.now();
          }
        `,
      },
    },
    {
      why: "new Date() with no args",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function doThing() {
            return new Date();
          }
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "new Date(ms) with args",
      files: {
        "packages/server/src/domain/feature/logic.ts": `
          export function parse(ms: number) {
            return new Date(ms);
          }
        `,
      },
    },
    {
      why: "Date.now() in allowed test file",
      files: {
        "tests/server/logic.test.ts": `
          export function doThing() {
            return Date.now();
          }
        `,
      },
    },
    {
      why: "Date.now() in allowed kit/time",
      files: {
        "packages/kit/src/time/index.ts": `
          export function doThing() {
            return Date.now();
          }
        `,
      },
    },
  ],
};
