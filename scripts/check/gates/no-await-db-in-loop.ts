import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const DB_QUERY_RE = /\b(db|tx)\.(query\.|select\b|insert\b|update\b|delete\b|run\b|execute\b|executeMultiple\b|batch\b|transaction\b)/;

export const gate: GateDescriptor = {
  name: "no-await-db-in-loop",
  docRow: "Spine-TypeScript-and-Patterns.md §8",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "await on a db/tx query inside a loop — N+1 shape: one round-trip per iteration. Batch it: inArray() for per-id reads, a JOIN, db.batch([...]) for multi-statement writes, .values([...]) for bulk inserts. If the serialization is deliberate (heartbeats, backpressure, per-row error observation), suppress WITH the reason. See Spine-TypeScript-and-Patterns.md §8.",
  kinds: [SyntaxKind.AwaitExpression],
  scanRoot: (p) => !(p.includes(".test.") || p.startsWith("tests/")),
  visit(node, _sf, ctx): void {
    if (!Node.isAwaitExpression(node)) {
      return;
    }
    const expr = node.getExpression();
    if (!Node.isCallExpression(expr)) {
      return;
    }

    const text = expr.getText();
    if (!DB_QUERY_RE.test(text)) {
      return;
    }

    let current: Node | undefined = node.getParent();
    while (current && !Node.isSourceFile(current)) {
      if (
        Node.isForStatement(current) ||
        Node.isForOfStatement(current) ||
        Node.isForInStatement(current) ||
        Node.isWhileStatement(current) ||
        Node.isDoStatement(current)
      ) {
        ctx.report(node);
        return;
      }
      if (Node.isFunctionDeclaration(current) || Node.isArrowFunction(current) || Node.isFunctionExpression(current) || Node.isMethodDeclaration(current)) {
        // A function boundary means the await is not directly executed in the loop body
        break;
      }
      current = current.getParent();
    }
  },
  mustFlag: [
    {
      why: "await db.select in loop",
      files: {
        "src/x.ts": `
          export async function f() {
            for (const x of xs) {
              await db.select().from(y);
            }
          }
        `,
      },
    },
    {
      why: "await tx.insert in while loop",
      files: {
        "src/x.ts": `
          export async function f() {
            while (true) {
              await tx.insert(y).values(z);
            }
          }
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "exempt in tests",
      files: {
        "tests/x.test.ts": `
          export async function f() {
            for (const x of xs) {
              await db.select().from(y);
            }
          }
        `,
      },
    },
    {
      why: "no loop",
      files: {
        "src/x.ts": `
          export async function f() {
            await db.select().from(y);
          }
        `,
      },
    },
  ],
};
