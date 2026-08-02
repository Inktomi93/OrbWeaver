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
import type { GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const SCOPE = /\/packages\/(?:client|ui)\/src\//u;
/** The two seal homes, named individually so the stale arm can name the dead one. */
const EXEMPT_ZONES: readonly RegExp[] = [/\/packages\/ui\/src\/markdown\//u, /\/packages\/ui\/src\/content\/sandbox-frame\//u];

const GATE_SELF = "scripts/check/gates/no-untrusted-html-in-main-dom.ts";
/** Real-tree anchor (gate-hub #11). */
const ANCHOR = "packages/ui/src/tokens/index.ts";
const STALE_PREFIX =
  "stale EXEMPT zone — the pattern matches NO file in the project (ratchet down): the seal home it named " +
  "was renamed or deleted, so the row exempts nothing while reading as live law. Re-point or delete it: ";

export const gate: GateDescriptor = {
  name: "no-untrusted-html-in-main-dom",
  docRow: "UI-Theming-and-Content.md §12.2",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "dangerouslySetInnerHTML in the app DOM — untrusted HTML MUST go through <SandboxFrame> (sandboxed iframe + per-frame CSP) or the sanitized @orb/ui/markdown seal (D44 — UI-Theming-and-Content.md §12.2). Never inject raw HTML into the main document.",
  fix: "use <SandboxFrame> or the @orb/ui/markdown seal",
  scanRoot: (p) => {
    const full = `/${p}`;
    return SCOPE.test(full) && !EXEMPT_ZONES.some((zone) => zone.test(full));
  },
  kinds: [SyntaxKind.JsxAttribute],
  visit: (node, _sf, ctx) => {
    if (!Node.isJsxAttribute(node)) {
      return;
    }
    if (node.getNameNode().getText() === "dangerouslySetInnerHTML") {
      ctx.report(node, { token: "dangerouslySetInnerHTML", offset: 0 });
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
          message: `${STALE_PREFIX}${zone.source} — the zone list lives in scripts/check/gates/no-untrusted-html-in-main-dom.ts`,
        });
      }
    }
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
      expect: { count: 1, messageIncludes: "stale EXEMPT zone" },
      why: "THE STALE ARM: the anchor is loaded and the markdown seal still matches a file, but the sandbox-frame zone matches none — that row exempts nothing and ratchets down",
    },
  ],
  mustPass: [
    {
      files: "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n",
      at: "packages/ui/src/markdown/index.tsx",
      why: "exempt markdown seal",
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
      why: "both seal homes STILL EARNED, judged against the real-tree anchor: each matches a live file, so the stale arm stays quiet",
    },
  ],
};
