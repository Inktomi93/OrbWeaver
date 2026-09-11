// Gate: no-raw-spacing-in-features (UI-Architecture-and-Layout.md) — raw spacing utilities are banned in
// client/ui source; compose from the layout primitives + intent tokens instead.
//
// THE ALLOWLIST IS A TIER PERMISSION, NOT A BURN-DOWN LIST: `packages/ui/src/layout/` and
// `packages/ui/src/markdown/` are the primitives that IMPLEMENT the intent tokens, so they may spell the
// raw utility. SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): those homes are SCANNED and exempted
// by cited rows, not scoped out of the population, and the RENAME TRIPWIRE is the ONE shared implementation
// (lib/sanctioned-home.ts) instead of a hand-rolled sweep re-spelled in four sibling gates. The tripwire is
// a SEPARATE policy in this same family (`spacing-tier-home-health`) because the occurrence check below is
// per-file/incremental-safe while the tripwire needs the entire declared population to know whether a home
// resolved to zero files — one `execution` value cannot serve both.
//
// THE CARRIER FENCE IS REAL, AND THE MESSAGE'S "in className" IS THEREFORE EARNED (re-derived 2026-09-11,
// #1954, against the `no-color-literals` finding that a header may not claim a context its visitor never
// applies). `inClassCarrier` below IS applied on every hit, and it admits two carriers: a `className` JSX
// attribute and a class-composer call (`cn`/`clsx`/`cva`/`tv`) — so the `tv()` variant maps that made an
// ancestry fence wrong for `no-color-literals` are INSIDE this fence, not blinded by it. The fence is pinned
// in both directions: the `cn(…)` mustFlag row proves the composer arm bites, and the bare-constant mustPass
// row proves an uncarried string does not. Deleting either leaves the header's claim unproven.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable } from "../contract/gate.ts";
import { defineGate } from "../contract/policy.ts";
import { sanctionedHome } from "../lib/sanctioned-home.ts";

/** The tier-permission homes — the primitives that IMPLEMENT the intent tokens. Shared verbatim with the
 *  `spacing-tier-home-health` sibling policy so both judge the exact same rows. */
export const SANCTIONED_HOMES: ExemptionTable = {
  "packages/ui/src/layout/": {
    why: "the layout primitives (<Stack>/<Row>/<Section>/<Toolbar>) ARE the implementation of the intent tokens — they must spell the raw utility once so no feature ever does. Ends when the primitives move: the rename tripwire reds the row at its dead path",
  },
  "packages/ui/src/markdown/": {
    why: "the markdown renderer maps prose elements onto the same spacing scale by hand — a token-only rewrite is the end condition, and the rename tripwire reds the row the day the renderer moves",
  },
};

const MESSAGE =
  "raw spacing utility in className — use a layout primitive (<Stack>, <Row>, <Section>, <Toolbar>) or an intent token (gap-section, p-row, py-block, gap-gutter). See docs/architecture/core/UI-Architecture-and-Layout.md.";

const SPACING_REGEX = /\b(?:gap|p[xytrbl]?|m[xytrbl]?|space-[xy])-(?:[1-9]\d*|\d+\.\d+|\[[^\]]+\])/u;

/** The CARRIER FENCE (GATE-AUTHORING.md §5): a spacing token is ambiguous enough that only a className
 *  attribute or a class-composer call (`cn`/`clsx`/`cva`/`tv`) counts as a class string. */
const CLASS_COMPOSERS: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv"]);

function inClassCarrier(node: Node): boolean {
  const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsxAttr !== undefined && jsxAttr.getNameNode().getText() === "className") {
    return true;
  }
  const callExpr = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return callExpr !== undefined && CLASS_COMPOSERS.has(callExpr.getExpression().getText());
}

export const gate = defineGate({
  id: "no-raw-spacing-in-features",
  family: "raw-spacing-tier",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "Use layout primitives or intent tokens instead of raw spacing classes.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node, sourceFile) => {
          if (sanctionedHome(SANCTIONED_HOMES, ctx.relativePath(sourceFile)) !== undefined) {
            return;
          }
          const text = node.getText();
          if (SPACING_REGEX.test(text) && inClassCarrier(node)) {
            ctx.report.node(node, { token: text, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div className="p-4" />;' },
      expect: { count: 1, token: '"p-4"' },
      why: "raw spacing class in className",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const y = cn("gap-2", "text-black");' },
      expect: { count: 1, token: '"gap-2"' },
      why: "raw spacing class in cn",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/ui/src/layout/test.tsx": 'const x = <div className="p-4" />;' },
      why: "THE ALLOWLIST ITSELF: the layout tier is now SCANNED, and its raw utility passes only because a cited SANCTIONED_HOMES row covers it",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.tsx": 'const x = <div className="p-row" />;' },
      why: "valid intent token",
    },
    {
      mode: "source",
      files: { "packages/client/src/test.ts": 'export const note = "set p-4 on the wrapper to reproduce";' },
      why: "THE CARRIER FENCE (#1954): the exact banned utility `p-4`, in an ordinary string constant with no className attribute and no cn/clsx/cva/tv call above it, does NOT flag. This is the pin for the header's fenced claim and for the message's 'in className' wording — drop `inClassCarrier` and this row goes red instead of the claim silently becoming false.",
    },
  ],
});
