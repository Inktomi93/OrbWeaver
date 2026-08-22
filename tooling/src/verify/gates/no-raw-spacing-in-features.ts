// Gate: no-raw-spacing-in-features (UI-Architecture-and-Layout.md) — raw spacing utilities are banned in
// client/ui source; compose from the layout primitives + intent tokens instead.
//
// THE ALLOWLIST IS A TIER PERMISSION, NOT A BURN-DOWN LIST: `packages/ui/src/layout/` and
// `packages/ui/src/markdown/` are the primitives that IMPLEMENT the intent tokens, so they may spell the
// raw utility. SCAN-AND-ALLOWLIST (GATE-AUTHORING.md §3, 2026-08-22): those homes are SCANNED and exempted
// by cited rows, not scoped out of scanRoot, and the RENAME TRIPWIRE is the ONE shared implementation
// (lib/sanctioned-home.ts) instead of a hand-rolled sweep re-spelled in four sibling gates. TWO-SIDED
// (gate-hub #10) at the honest grain — a row matching NO file in the project is RED (path rot kills a
// permission silently). The stronger "zone buys no exemption today" arm is deliberately NOT taken: a tier
// permission is prospective, and zero live violations inside it is the healthy state, not a dead row. The
// arm self-guards on a REAL-TREE ANCHOR (gate-hub #11) — the token vocabulary these messages point at, which
// sits outside both homes — because a conformance mini-project holds one file and would "prove" both had
// vanished.
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//u;
const GATE_SELF = "tooling/src/verify/gates/no-raw-spacing-in-features.ts";
/** Real-tree anchor (gate-hub #11): the generated token vocabulary this gate's message points at. */
const ANCHOR = "packages/ui/src/tokens/index.ts";
/** The tier-permission homes — the primitives that IMPLEMENT the intent tokens. */
const SANCTIONED_HOMES: ExemptionTable = {
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

export const gate: GateDescriptor = {
  name: "no-raw-spacing-in-features",
  docRow: "docs/architecture/core/UI-Architecture-and-Layout.md",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Use layout primitives or intent tokens instead of raw spacing classes.",
  scanRoot: (p) => SCOPE_REGEX.test(`/${p}`),
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
  visit: (node, sf, ctx) => {
    if (!(Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    const text = node.getText();
    if (SPACING_REGEX.test(text) && inClassCarrier(node)) {
      ctx.report(node, { token: text, offset: 0 });
    }
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "spacing-token implementation tier", anchor: ANCHOR });
  },
  mustFlag: [
    {
      files: 'const x = <div className="p-4" />;',
      at: "packages/client/src/test.tsx",
      why: "raw spacing class in className",
    },
    {
      files: 'const y = cn("gap-2", "text-black");',
      at: "packages/client/src/test.tsx",
      why: "raw spacing class in cn",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the anchor is loaded and the layout home still resolves, but the markdown home resolves to no file — that row permits nothing and ratchets down",
    },
  ],
  mustPass: [
    {
      files: 'const x = <div className="p-4" />;',
      at: "packages/ui/src/layout/test.tsx",
      why: "THE ALLOWLIST ITSELF: the layout tier is now SCANNED, and its raw utility passes only because a cited SANCTIONED_HOMES row covers it",
    },
    {
      files: 'const x = <div className="p-row" />;',
      at: "packages/client/src/test.tsx",
      why: "valid intent token",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
        "packages/ui/src/markdown/render.tsx": "export const M = null;\n",
      },
      why: "both homes STILL EARNED, judged against the real-tree anchor: each resolves to a live file, so the tripwire stays quiet",
    },
  ],
};
