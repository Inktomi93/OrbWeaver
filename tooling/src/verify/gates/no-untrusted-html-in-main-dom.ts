// Gate: no-untrusted-html-in-main-dom (UI-Theming-and-Content.md §12.2, D44) — raw HTML reaches the user
// through the sandboxed iframe or the sanitized markdown seal, never through the app document.
//
// THE EXEMPT ZONES ARE THE TWO SEALS THEMSELVES. TWO-SIDED (gate-hub #10) at the path-rot grain: a zone
// matching NO file in the project is RED (a rename kills the exemption's meaning while it still reads as
// live law). The stronger "the seal doesn't inject today" arm would be WRONG here and was measured before
// being rejected: NEITHER seal spells `dangerouslySetInnerHTML` right now (markdown goes through
// Streamdown's sanitized render, sandbox-frame through `srcdoc`) — their permission is the architecture's
// standing answer to "where may raw HTML go", not a live-usage claim. The arm self-guards on a REAL-TREE
// ANCHOR (gate-hub #11): the token vocabulary, which a conformance mini-project never carries by accident.
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const SCOPE = /\/packages\/(?:client|ui)\/src\//u;
/** The two seal homes — SCANNED, exempted by a cited row, swept by the shared rename tripwire. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/ui/src/markdown/": {
    why: "the sanitized markdown seal — the architecture's standing answer to 'where may rendered HTML go', whether or not it spells the injection today (it currently goes through Streamdown's sanitized render). Ends when the seal moves: the rename tripwire reds the row at its dead path",
  },
  "packages/ui/src/content/sandbox-frame/": {
    why: "the sandboxed iframe host (srcdoc + per-frame CSP) — the other sanctioned destination for untrusted HTML, same standing permission and the same end condition",
  },
};

const GATE_SELF = "tooling/src/verify/gates/no-untrusted-html-in-main-dom.ts";
/** Real-tree anchor (gate-hub #11). */
const ANCHOR = "packages/ui/src/tokens/index.ts";

export const gate: GateDescriptor = {
  name: "no-untrusted-html-in-main-dom",
  docRow: "UI-Theming-and-Content.md §12.2",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "dangerouslySetInnerHTML in the app DOM — untrusted HTML MUST go through <SandboxFrame> (sandboxed iframe + per-frame CSP) or the sanitized @orb/ui/markdown seal (D44 — UI-Theming-and-Content.md §12.2). Never inject raw HTML into the main document.",
  fix: "use <SandboxFrame> or the @orb/ui/markdown seal",
  scanRoot: (p) => SCOPE.test(`/${p}`),
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, sf, ctx) => {
    if (!Node.isJsxAttribute(node)) {
      return;
    }
    if (sanctionedHome(SANCTIONED_HOMES, repoRel(ctx.root, sf.getFilePath())) !== undefined) {
      return;
    }
    if (node.getNameNode().getText() === "dangerouslySetInnerHTML") {
      ctx.report(node, { token: "dangerouslySetInnerHTML", offset: 0 });
    }
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "raw-HTML seal", anchor: ANCHOR });
  },
  mustFlag: [
    {
      files: "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
      at: "packages/client/src/components/foo.tsx",
      why: "dangerouslySetInnerHTML used outside sanctioned seals",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/markdown/index.tsx": "export const M = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the anchor is loaded and the markdown seal still resolves, but the sandbox-frame home resolves to no file — that row exempts nothing and ratchets down",
    },
  ],
  mustPass: [
    {
      files: "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
      at: "packages/ui/src/markdown/index.tsx",
      why: "THE ALLOWLIST ITSELF: the markdown seal is now SCANNED and its injection passes only on a cited SANCTIONED_HOMES row",
    },
    {
      files: "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
      at: "packages/ui/src/content/sandbox-frame/index.tsx",
      why: "exempt sandbox seal — and with no anchor in this project the stale arm stays silent (THE ANCHOR GUARD)",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        "packages/ui/src/markdown/index.tsx": "export const M = null;\n",
        "packages/ui/src/content/sandbox-frame/index.tsx": "export const S = null;\n",
      },
      why: "both seal homes STILL EARNED, judged against the real-tree anchor: each resolves to a live file, so the tripwire stays quiet",
    },
  ],
};
