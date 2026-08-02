// Gate: theme-override-only-via-scope (UI-Theming-and-Content.md §12.1, D44) — a raw `style` prop setting a
// `--color-*` design token bypasses the ThemeScope clamp (parse-as-color; reject url()/expression()/@import).
//
// THE EXEMPT ZONES ARE THE CLAMP ITSELF: `content/theme-scope/` IS the sanctioned override boundary and
// `content/sandbox-frame/` is the null-origin srcdoc host that must inject computed values (a srcdoc cannot
// resolve var()). TWO-SIDED (gate-hub #10) at the honest grain — a zone matching NO file in the project is
// RED (path rot: a rename silently kills the exemption's meaning while it still reads as live law). The
// stronger "the zone sets no --color-* today" arm is deliberately NOT taken: these are the clamp homes, and
// their permission is structural, not a burn-down list. The arm self-guards on a REAL-TREE ANCHOR
// (gate-hub #11) — the token vocabulary — because a conformance mini-project would "prove" both had vanished.
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const SCOPE = /\/packages\/(?:client|ui)\/src\//u;
/** The clamp homes, one regex each so the stale arm can name the dead one. */
const EXEMPT_ZONES: readonly RegExp[] = [/\/packages\/ui\/src\/content\/theme-scope\//u, /\/packages\/ui\/src\/content\/sandbox-frame\//u];

const GATE_SELF = "scripts/check/gates/theme-override-only-via-scope.ts";
/** Real-tree anchor (gate-hub #11): the generated token vocabulary the clamp governs. */
const ANCHOR = "packages/ui/src/tokens/index.ts";
const STALE_PREFIX =
  "stale EXEMPT zone — the pattern matches NO file in the project (ratchet down): the clamp home it named " +
  "was renamed or deleted, so the row exempts nothing while reading as live law. Re-point or delete it: ";

export const gate: GateDescriptor = {
  name: "theme-override-only-via-scope",
  docRow: "UI-Theming-and-Content.md §12.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "inline style overriding a --color-* design token — token overrides go through <ThemeScope> (values clamped at the boundary: parse-as-color, reject url()/expression()/@import; D44 — UI-Theming-and-Content.md §12.1). Never set --color-* in a raw style prop.",
  fix: "use <ThemeScope> to override color tokens",
  scanRoot: (p) => {
    const full = `/${p}`;
    return SCOPE.test(full) && !EXEMPT_ZONES.some((zone) => zone.test(full));
  },
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, _sf, ctx) => {
    if (!Node.isJsxAttribute(node)) {
      return;
    }
    if (node.getNameNode().getText() === "style" && node.getText().includes("--color-")) {
      ctx.report(node, { token: "style", offset: 0 });
    }
  },
  finalize: (ctx) => {
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, ANCHOR)) {
      return;
    }
    const paths = ctx.project.getSourceFiles().map((sf) => sf.getFilePath() as string);
    for (const zone of EXEMPT_ZONES) {
      if (!paths.some((p) => zone.test(p))) {
        ctx.report({
          file: GATE_SELF,
          line: 1,
          column: 0,
          message: `${STALE_PREFIX}${zone.source} — the zone list lives in scripts/check/gates/theme-override-only-via-scope.ts`,
        });
      }
    }
  },
  mustFlag: [
    {
      files: "export const A = () => <div style={{ '--color-primary': 'red' }} />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "inline style overriding a color token",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/content/theme-scope/index.tsx": "export const T = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale EXEMPT zone" },
      why: "THE STALE ARM: the anchor is loaded and the theme-scope clamp still matches a file, but the sandbox-frame zone matches none — that row exempts nothing and ratchets down",
    },
  ],
  mustPass: [
    {
      files: "export const A = () => <div style={{ width: 10 }} />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "inline style not overriding a color token",
    },
    {
      files: "export const A = () => <div style={{ '--color-primary': 'red' }} />;\n",
      at: "packages/ui/src/content/theme-scope/index.tsx",
      why: "exempt theme scope clamp — and with no anchor in this project the stale arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/content/theme-scope/index.tsx": "export const T = null;\n",
        "packages/ui/src/content/sandbox-frame/frame.tsx": "export const F = null;\n",
      },
      why: "both clamp homes STILL EARNED, judged against the real-tree anchor: each matches a live file, so the stale arm stays quiet",
    },
  ],
};
