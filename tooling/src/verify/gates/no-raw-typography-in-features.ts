// Gate: no-raw-typography-in-features (UI-Architecture-and-Layout.md) — raw font-size utilities are banned
// in client/ui source; compose from the layout primitives + intent tokens instead.
//
// THE ALLOWLIST IS A TIER PERMISSION, NOT A BURN-DOWN LIST: `packages/ui/src/layout/` and
// `packages/ui/src/markdown/` are the primitives that IMPLEMENT the intent tokens, so they may spell the
// raw utility. SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): those homes are SCANNED and exempted
// by cited rows, not scoped out of the population, and the RENAME TRIPWIRE is the ONE shared implementation
// (lib/sanctioned-home.ts) instead of a hand-rolled sweep re-spelled in four sibling gates. The tripwire is
// a SEPARATE policy in this same family (`typography-tier-home-health`) because the occurrence check below
// is per-file/incremental-safe while the tripwire needs the entire declared population to know whether a
// home resolved to zero files — one `execution` value cannot serve both.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable } from "../contract/gate.ts";
import { defineGate } from "../contract/policy.ts";
import { sanctionedHome } from "../lib/sanctioned-home.ts";

/** The tier-permission homes — the primitives that IMPLEMENT the intent tokens. Shared verbatim with the
 *  `typography-tier-home-health` sibling policy so both judge the exact same rows. */
export const SANCTIONED_HOMES: ExemptionTable = {
  "packages/ui/src/layout/": {
    why: "the layout primitives (<Stack>/<Row>/<Section>/<Toolbar>) ARE the implementation of the typography tokens — they must spell the raw utility once so no feature ever does. Ends when the primitives move: the rename tripwire reds the row at its dead path",
  },
  "packages/ui/src/markdown/": {
    why: "the markdown renderer maps prose elements onto the same typography scale by hand — a token-only rewrite is the end condition, and the rename tripwire reds the row the day the renderer moves",
  },
};

/** The CARRIER FENCE (GATE-AUTHORING.md §5): only a className attribute or a class-composer call
 *  (`cn`/`clsx`/`cva`/`tv`) counts as a class string for this ambiguous token shape. */
const CLASS_COMPOSERS: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv"]);

function inClassCarrier(node: Node): boolean {
  const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsxAttr !== undefined && jsxAttr.getNameNode().getText() === "className") {
    return true;
  }
  const callExpr = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return callExpr !== undefined && CLASS_COMPOSERS.has(callExpr.getExpression().getText());
}

const MESSAGE =
  "raw font-size utility in className — use a typography intent token (text-micro, text-label, text-body, text-hint, text-mono-tag). See docs/architecture/core/UI-Architecture-and-Layout.md.";

const TYPOGRAPHY_REGEX = /\btext-(?:xs|sm|base|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl|8xl|9xl|\[[^\]]+\])/u;

export const gate = defineGate({
  id: "no-raw-typography-in-features",
  family: "raw-typography-tier",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "Use a typography intent token instead of raw text-size classes.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node, sourceFile) => {
          if (sanctionedHome(SANCTIONED_HOMES, ctx.relativePath(sourceFile)) !== undefined) {
            return;
          }
          const text = node.getText();
          if (TYPOGRAPHY_REGEX.test(text) && inClassCarrier(node)) {
            ctx.report.node(node, { token: text, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div className="text-sm" />;' },
      expect: { count: 1, token: '"text-sm"' },
      why: "raw typography class in className",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const y = cn("text-xl", "font-bold");' },
      expect: { count: 1, token: '"text-xl"' },
      why: "raw typography class in cn",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/layout/test.tsx": 'const x = <div className="text-sm" />;' },
      why: "THE ALLOWLIST ITSELF: the layout tier is now SCANNED, and its raw utility passes only because a cited SANCTIONED_HOMES row covers it",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div className="text-body" />;' },
      why: "valid intent token",
    },
  ],
});
