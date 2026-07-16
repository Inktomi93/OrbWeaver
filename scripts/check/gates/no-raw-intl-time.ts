import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

// Per-occurrence message override (toLocale* vs raw Intl.* differ) → explicit-Finding overload.
function reportFinding(node: Node, ctx: GateRunCtx, message: string): void {
  ctx.report({
    file: relPath(ctx.root, node.getSourceFile().getFilePath()),
    line: node.getStartLineNumber(),
    column: 0,
    message,
  });
}

export const gate: GateDescriptor = {
  name: "no-raw-intl-time",
  docRow: "Spine-TypeScript-and-Patterns.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: "raw Intl API or .toLocale*() usage. (Spine-TypeScript-and-Patterns.md)",
  kinds: [SyntaxKind.CallExpression, SyntaxKind.PropertyAccessExpression],
  scanRoot: (p) => !p.startsWith("packages/kit/src/time/"),
  visit(node, _sf, ctx): void {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if (Node.isPropertyAccessExpression(expr)) {
        const name = expr.getName();
        if (name === "toLocaleDateString" || name === "toLocaleString" || name === "toLocaleTimeString") {
          reportFinding(
            node,
            ctx,
            "raw .toLocale*() date formatting — Intl by the back door: un-memoized (rebuilds an Intl formatter per call), locale/tz-inconsistent with every @orb/kit/time site, and unpinnable by the injected-clock/locale test discipline. Use @orb/kit/time's createTimeLib (client: timeLib.formatDate/formatDateTime/formatTime/formatRelative) instead. See Spine-TypeScript-and-Patterns.md.",
          );
        }
      }
      return;
    }

    if (Node.isPropertyAccessExpression(node)) {
      const name = node.getName();
      if ((name === "DateTimeFormat" || name === "RelativeTimeFormat") && node.getExpression().getText() === "Intl") {
        reportFinding(
          node,
          ctx,
          "raw Intl.{DateTimeFormat,RelativeTimeFormat} — use @orb/kit/time (the one seam for time display + zone resolution). Time is epoch-ms UTC everywhere, rendered through one helper. See Spine-TypeScript-and-Patterns.md.",
        );
      }
    }
  },
  mustFlag: [
    {
      why: "Intl.DateTimeFormat used",
      files: {
        "packages/client/src/comp.tsx": `
          export function Foo() {
            const f = new Intl.DateTimeFormat('en-US');
            return null;
          }
        `,
      },
    },
    {
      why: ".toLocaleDateString used",
      files: {
        "packages/client/src/comp.tsx": `
          export function Foo() {
            return new Date().toLocaleDateString();
          }
        `,
      },
    },
  ],
  mustPass: [
    {
      why: "exempt package kit time",
      files: {
        "packages/kit/src/time/index.ts": `
          export function build() {
            const f = new Intl.DateTimeFormat('en-US');
            return new Date().toLocaleDateString();
          }
        `,
      },
    },
  ],
};
