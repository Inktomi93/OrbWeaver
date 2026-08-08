// SUPPRESSION: both arms are NODE-anchored and carry their arm as the finding's token, so
// `// @orb-gate-ignore no-raw-intl-time(tolocale|intl-formatter): <reason>` works AND names its position.
// Until 2026-08-08 this file reported through the explicit-`Finding` overload and said so in a comment —
// "per-occurrence message override … → explicit-Finding overload" — which is precisely the trade
// GATE-AUTHORING §1 forbids: the overload bypasses `hasGateIgnore`, so every marker here was inert. The two
// per-arm messages moved onto the group `message`, which is where the harness homes a reason.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";

/** The ARM tokens — each finding's `token`, and the position an `@orb-gate-ignore` names. */
const ARM_TOKENS = { toLocale: "tolocale", intlFormatter: "intl-formatter" } as const;

function report(node: Node, token: string, ctx: GateRunCtx): void {
  ctx.report(node, { token, offset: 0 });
}

export const gate: GateDescriptor = {
  name: "no-raw-intl-time",
  docRow: "Spine-TypeScript-and-Patterns.md",
  status: "active",
  scopeSafety: "incremental-safe",
  // THE ONE REASON, carrying BOTH arms by token (the per-arm overrides died with the Finding overload).
  message:
    "raw Intl API or .toLocale*() date formatting — Intl by the back door. `tolocale`: a bare " +
    "`.toLocaleDateString/String/TimeString()` is un-memoized (it rebuilds an Intl formatter per call), " +
    "locale/tz-inconsistent with every @orb/kit/time site, and unpinnable by the injected-clock/locale test " +
    "discipline. `intl-formatter`: a raw `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat` bypasses the one " +
    "seam for time display + zone resolution. Time is epoch-ms UTC everywhere, rendered through one helper. " +
    "(Spine-TypeScript-and-Patterns.md)",
  fix: "use @orb/kit/time's createTimeLib — client: timeLib.formatDate/formatDateTime/formatTime/formatRelative.",
  kinds: [SyntaxKind.CallExpression, SyntaxKind.PropertyAccessExpression],
  scanRoot: (p) => !p.startsWith("packages/kit/src/time/"),
  visit(node, _sf, ctx): void {
    if (Node.isCallExpression(node)) {
      const expr = node.getExpression();
      if (Node.isPropertyAccessExpression(expr)) {
        const name = expr.getName();
        if (name === "toLocaleDateString" || name === "toLocaleString" || name === "toLocaleTimeString") {
          report(node, ARM_TOKENS.toLocale, ctx);
        }
      }
      return;
    }

    if (Node.isPropertyAccessExpression(node)) {
      const name = node.getName();
      if ((name === "DateTimeFormat" || name === "RelativeTimeFormat") && node.getExpression().getText() === "Intl") {
        report(node, ARM_TOKENS.intlFormatter, ctx);
      }
    }
  },
  mustFlag: [
    {
      expect: { count: 1, token: "intl-formatter" },
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
      expect: { count: 1, token: "tolocale" },
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
