import { Node, SyntaxKind } from "ts-morph";
import { readStringValue } from "../ast-read.ts";
import type { GateDescriptor } from "../contract.ts";

export const gate: GateDescriptor = {
  name: "no-fake-disabled-id",
  docRow: "UI-Gates-and-Lessons.md §11.5",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "empty-string branded id (the fake-disabled sentinel) — if the enabled: guard is ever dropped, the empty id hits the server. Use useGatedQuery/skipToken (a null id never builds the key). See UI-Gates-and-Lessons.md §11.5.",
  scanRoot: (p) => p.includes("packages/client/src/"),
  kinds: [SyntaxKind.CallExpression],
  visit(node, _sf, ctx): void {
    if (!Node.isCallExpression(node)) {
      return;
    }

    const expr = node.getExpression();
    if (!Node.isIdentifier(expr) || expr.getText() !== "castId") {
      return;
    }

    const args = node.getArguments();
    if (args.length !== 1) {
      return;
    }

    const arg = args[0];
    if (arg !== undefined && readStringValue(arg) === "") {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      why: 'castId("")',
      files: {
        "packages/client/src/some-file.ts": `
          castId("");
        `,
      },
    },
    {
      why: 'castId<Type>("")',
      files: {
        "packages/client/src/some-file.ts": `
          castId<Type>("");
        `,
      },
    },
    {
      why: 'castId("" as ChatId) — the empty sentinel wrapped in an AsExpression; the plain StringLiteral reader passed it before hardening',
      files: {
        "packages/client/src/some-file.ts": `
          castId("" as ChatId);
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "castId with non-empty string",
      files: {
        "packages/client/src/some-file.ts": `
          castId("some-id");
        `,
      },
    },
  ],
};
