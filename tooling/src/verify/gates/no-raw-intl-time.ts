// SUPPRESSION: both arms are NODE-anchored and carry their arm as the finding's token, so
// `// @orb-gate-ignore no-raw-intl-time(tolocale|intl-formatter): <reason>` works AND names its position.
// Until 2026-08-08 this file reported through the explicit-`Finding` overload and said so in a comment —
// "per-occurrence message override … → explicit-Finding overload" — which is precisely the trade
// GATE-AUTHORING §1 forbids: the overload bypasses `hasGateIgnore`, so every marker here was inert. The two
// per-arm messages moved onto the group `message`, which is where the harness homes a reason.
//
// SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): the time home is SCANNED and exempted by a cited
// row plus the shared RENAME TRIPWIRE, not scoped out of scanRoot — an excluded home carries its exemption
// silently through a move, and this gate's whole claim is that time display has ONE address.
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { HOME_SWEEP_ANCHOR, reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

/** The ARM tokens — each finding's `token`, and the position an `@orb-gate-ignore` names. */
const ARM_TOKENS = { toLocale: "tolocale", intlFormatter: "intl-formatter" } as const;

const GATE_SELF = "tooling/src/verify/gates/no-raw-intl-time.ts";

/** The ONE home allowed to touch Intl directly — it is what `createTimeLib` is built out of. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/kit/src/time/": {
    why: "@orb/kit/time IS the memoized Intl seam (createTimeLib) — the formatters it hands every call site are constructed here. Ends when the time engine moves: the rename tripwire reds the row at its dead path",
  },
};

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
  scanRoot: (_p) => true,
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "kit time seam" });
  },
  visit(node, sf, ctx): void {
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
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
    {
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the shared anchor is loaded but packages/kit/src/time/ resolves to no file — the time seam moved, and the old scanRoot exclusion would have kept exempting a dead path forever",
      files: {
        [HOME_SWEEP_ANCHOR]: "export const schema = {};\n",
      },
    },
  ],
  mustPass: [
    {
      why: "THE ALLOWLIST ITSELF: the kit time home is now SCANNED and its own Intl construction passes on a cited SANCTIONED_HOMES row",
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
