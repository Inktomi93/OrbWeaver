// Gate: no-raw-z-index (UI-Architecture-and-Layout.md) — raw z-N utilities are banned in
// client/ui source; compose from the layout primitives + intent tokens instead.
//
// THE ALLOWLIST IS A TIER PERMISSION, NOT A BURN-DOWN LIST: `packages/ui/src/layout/` and
// `packages/ui/src/markdown/` are the primitives that IMPLEMENT the intent tokens, so they may spell the
// raw utility. TWO-SIDED (gate-hub #10) at the honest grain — a zone matching NO file in the project is
// RED (path rot: these patterns are path-shaped and die silently on a rename, and a dead zone pattern
// un-scans nothing while looking like it still permits something). The stronger "zone buys no exemption
// today" arm is deliberately NOT taken: a tier permission is prospective, and zero live violations inside
// it is the healthy state, not a dead row. The arm self-guards on a REAL-TREE ANCHOR (gate-hub #11) — the
// token vocabulary these messages point at — because a conformance mini-project holds one file and would
// "prove" both zones had vanished.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//u;
const GATE_SELF = "scripts/check/gates/no-raw-z-index.ts";
/** Real-tree anchor (gate-hub #11): the generated token vocabulary this gate's message points at. */
const ANCHOR = "packages/ui/src/tokens/index.ts";
/** The tier-permission zones, one regex each so the stale arm can name the dead one. */
const ALLOWLIST_ZONES: readonly RegExp[] = [/\/packages\/ui\/src\/layout\//u, /\/packages\/ui\/src\/markdown\//u];
const STALE_PREFIX =
  "stale ALLOWLIST zone — the pattern matches NO file in the project (ratchet down): the tier it permitted " +
  "was renamed or deleted, so the row now permits nothing while reading as live law. Re-point or delete it: ";

const MESSAGE =
  "raw z-N in className — use a semantic z-index token (z-modal, z-popover, z-tooltip, z-overlay, z-toast, z-dropdown, z-sticky). See packages/ui/src/styles/theme.css §z-index tokens and docs/architecture/core/UI-Architecture-and-Layout.md.";

const Z_INDEX_REGEX = /\bz-(?:\d+|\[\d+\])/u;

export const gate: GateDescriptor = {
  name: "no-raw-z-index",
  docRow: "packages/ui/src/styles/theme.css",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "Use a semantic z-index token.",
  scanRoot: (p) => {
    const path = `/${p}`;
    if (!SCOPE_REGEX.test(path)) {
      return false;
    }
    if (ALLOWLIST_ZONES.some((zone) => zone.test(path))) {
      return false;
    }
    return true;
  },
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
  visit: (node, _sf, ctx) => {
    if (!(Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node))) {
      return;
    }
    const text = node.getText();
    if (Z_INDEX_REGEX.test(text)) {
      let inScope = false;
      const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
      if (jsxAttr && jsxAttr.getNameNode().getText() === "className") {
        inScope = true;
      } else {
        const callExpr = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
        if (callExpr) {
          const expr = callExpr.getExpression().getText();
          if (["cn", "clsx", "cva", "tv"].includes(expr)) {
            inScope = true;
          }
        }
      }
      if (inScope) {
        ctx.report(node, { token: text, offset: 0 });
      }
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    const paths = ctx.project.getSourceFiles().map((sf) => sf.getFilePath() as string);
    for (const zone of ALLOWLIST_ZONES) {
      if (!paths.some((p) => zone.test(p))) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}${zone.source} — the zone list lives in scripts/check/gates/no-raw-z-index.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: 'const x = <div className="z-50" />;',
      at: "packages/client/src/test.tsx",
      why: "raw z-index class in className",
    },
    {
      files: 'const y = cn("z-[60]");',
      at: "packages/client/src/test.tsx",
      why: "raw z-index class in cn",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale ALLOWLIST zone" },
      why: "THE STALE ARM: the anchor is loaded and the layout zone still matches a file, but the markdown zone matches none — that row permits nothing and ratchets down",
    },
  ],
  mustPass: [
    {
      files: 'const x = <div className="z-50" />;',
      at: "packages/ui/src/layout/test.tsx",
      why: "allowlisted path",
    },
    {
      files: 'const x = <div className="z-modal" />;',
      at: "packages/client/src/test.tsx",
      why: "valid intent token",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
        "packages/ui/src/markdown/render.tsx": "export const M = null;\n",
      },
      why: "both zones STILL EARNED, judged against the real-tree anchor: each matches a live file, so the stale arm stays quiet",
    },
  ],
};
