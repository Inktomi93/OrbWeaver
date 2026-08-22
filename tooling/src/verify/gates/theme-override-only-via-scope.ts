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
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const SCOPE = /\/packages\/(?:client|ui)\/src\//u;
/** The clamp homes — SCANNED, exempted by a cited row, swept by the shared rename tripwire. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/ui/src/content/theme-scope/": {
    why: "the ThemeScope clamp IS the sanctioned override boundary (D44, UI-Theming-and-Content.md §12.1) — it is where a --color-* override is parsed and clamped. Ends when the clamp moves: the rename tripwire reds the row at its dead path",
  },
  "packages/ui/src/content/sandbox-frame/": {
    why: "the null-origin srcdoc host must inject COMPUTED values (a srcdoc cannot resolve var()) — a structural permission, not a burn-down row, with the same end condition",
  },
};

const GATE_SELF = "tooling/src/verify/gates/theme-override-only-via-scope.ts";
/** Real-tree anchor (gate-hub #11): the generated token vocabulary the clamp governs. */
const ANCHOR = "packages/ui/src/tokens/index.ts";

export const gate: GateDescriptor = {
  name: "theme-override-only-via-scope",
  docRow: "UI-Theming-and-Content.md §12.1",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "inline style overriding a --color-* design token — token overrides go through <ThemeScope> (values clamped at the boundary: parse-as-color, reject url()/expression()/@import; D44 — UI-Theming-and-Content.md §12.1). Never set --color-* in a raw style prop.",
  fix: "use <ThemeScope> to override color tokens",
  scanRoot: (p) => SCOPE.test(`/${p}`),
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, sf, ctx) => {
    if (!Node.isJsxAttribute(node)) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (node.getNameNode().getText() === "style" && node.getText().includes("--color-")) {
      ctx.report(node, { token: "style", offset: 0 });
    }
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "token-override clamp", anchor: ANCHOR });
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
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the anchor is loaded and the theme-scope clamp still resolves, but the sandbox-frame home resolves to no file — that row exempts nothing and ratchets down",
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
      why: "THE ALLOWLIST ITSELF: the clamp is now SCANNED and its own --color-* override passes on a cited SANCTIONED_HOMES row — and with no anchor in this project the tripwire stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/content/theme-scope/index.tsx": "export const T = null;\n",
        "packages/ui/src/content/sandbox-frame/frame.tsx": "export const F = null;\n",
      },
      why: "both clamp homes STILL EARNED, judged against the real-tree anchor: each resolves to a live file, so the tripwire stays quiet",
    },
  ],
};
