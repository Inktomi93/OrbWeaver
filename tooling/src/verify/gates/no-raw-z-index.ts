// Gate: no-raw-z-index (UI-Architecture-and-Layout.md) — raw z-N utilities are banned in
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
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Node, SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract/gate.ts";
import { repoRel } from "../lib/pass.ts";
import { reportUnresolvedHomes, sanctionedHome } from "../lib/sanctioned-home.ts";

const SCOPE_REGEX = /\/packages\/(?:client|ui)\/src\//u;
const GATE_SELF = "tooling/src/verify/gates/no-raw-z-index.ts";
/** Real-tree anchor (gate-hub #11): the generated token vocabulary this gate's message points at. */
const ANCHOR = "packages/ui/src/tokens/index.ts";
const TOKEN_SOURCE = "packages/ui/src/tokens/tokens.json";
const Z_TOKEN_NAMES = ["base", "raised", "overlay", "modal", "popover", "toast", "tooltip"] as const;
const Z_TOKEN_SET: ReadonlySet<string> = new Set(Z_TOKEN_NAMES);
/** The tier-permission homes — the primitives that IMPLEMENT the intent tokens. */
const SANCTIONED_HOMES: ExemptionTable = {
  "packages/ui/src/layout/": {
    why: "the layout primitives (<Stack>/<Row>/<Section>/<Toolbar>) ARE the implementation of the z-index tokens — they must spell the raw utility once so no feature ever does. Ends when the primitives move: the rename tripwire reds the row at its dead path",
  },
  "packages/ui/src/markdown/": {
    why: "the markdown renderer maps prose elements onto the same z-index scale by hand — a token-only rewrite is the end condition, and the rename tripwire reds the row the day the renderer moves",
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

const SEMANTIC_CLASSES = Z_TOKEN_NAMES.map((name) => `z-(--z-${name})`).join(" · ");
const MESSAGE = `raw z-N or unknown semantic z-index in className — use one of: ${SEMANTIC_CLASSES}. Those SEVEN are governed here and set-equal checked against packages/ui/src/tokens/tokens.json z.*; a name outside them resolves to an undefined custom property and the z-index declaration is silently dropped. See docs/architecture/core/client-architecture-lockdown.md §4.`;

const Z_INDEX_REGEX = /\bz-(?:\d+|\[\d+\])/u;
const SEMANTIC_Z_REGEX = /\bz-\(--z-([a-z0-9-]+)\)/gu;

function tokenVocabulary(root: string): readonly string[] | undefined {
  const source = join(root, TOKEN_SOURCE);
  if (!existsSync(source)) {
    return;
  }
  const parsed = JSON.parse(readFileSync(source, "utf8")) as { z?: unknown };
  if (typeof parsed.z !== "object" || parsed.z === null || Array.isArray(parsed.z)) {
    return;
  }
  return Object.keys(parsed.z).sort();
}

export const gate: GateDescriptor = {
  name: "no-raw-z-index",
  docRow: "packages/ui/src/styles/theme.css",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message: MESSAGE,
  fix: "Use one of the governed semantic z-index tokens; add a genuinely new stratum to the token source, gate vocabulary, and both-way controls together.",
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
    if (!inClassCarrier(node)) {
      return;
    }
    if (Z_INDEX_REGEX.test(text)) {
      ctx.report(node, { token: text, offset: 0 });
    }
    for (const match of text.matchAll(SEMANTIC_Z_REGEX)) {
      const name = match[1];
      if (name !== undefined && !Z_TOKEN_SET.has(name)) {
        ctx.report(node, { token: match[0], offset: match.index });
      }
    }
  },
  finalize: (ctx) => {
    reportUnresolvedHomes(ctx, SANCTIONED_HOMES, { gateSelf: GATE_SELF, what: "z-index-token implementation tier", anchor: ANCHOR });
    const live = tokenVocabulary(ctx.root);
    if (live === undefined) {
      if (existsSync(join(ctx.root, ANCHOR))) {
        ctx.report({
          file: TOKEN_SOURCE,
          line: 0,
          column: 0,
          message: `z-index vocabulary is unreadable at ${TOKEN_SOURCE}; the gate cannot prove that its recommended tokens exist.`,
        });
      }
      return;
    }
    ctx.scan({ unit: "z-index token", scanned: live.length });
    const expected = [...Z_TOKEN_NAMES].sort();
    if (live.join("\n") !== expected.join("\n")) {
      ctx.report({
        file: TOKEN_SOURCE,
        line: 0,
        column: 0,
        message: `z-index vocabulary drift: gate recommends [${expected.join(", ")}], tokens.json defines [${live.join(", ")}]. Update the governed vocabulary and its controls together.`,
      });
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
      files: 'const x = <div className="z-(--z-sticky)" />;',
      at: "packages/client/src/test.tsx",
      expect: { token: "z-(--z-sticky)" },
      why: "a semantic-looking class whose custom property is outside the governed token vocabulary",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        [TOKEN_SOURCE]: '{"z":{"base":{},"raised":{},"overlay":{},"modal":{},"popover":{},"toast":{}}}\n',
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
        "packages/ui/src/markdown/render.tsx": "export const M = null;\n",
      },
      expect: { count: 1, messageIncludes: "z-index vocabulary drift" },
      why: "the advertised vocabulary and token source are set-equal, so deleting a recommended token fails loud",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        [TOKEN_SOURCE]: `{"z":{${Z_TOKEN_NAMES.map((name) => `"${name}":{}`).join(",")}}}\n`,
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
      },
      expect: { count: 1, messageIncludes: "stale SANCTIONED-HOME row" },
      why: "THE RENAME TRIPWIRE (§4.4a mode B): the anchor is loaded and the layout home still resolves, but the markdown home resolves to no file — that row permits nothing and ratchets down",
    },
  ],
  mustPass: [
    {
      files: 'const x = <div className="z-50" />;',
      at: "packages/ui/src/layout/test.tsx",
      why: "THE ALLOWLIST ITSELF: the layout tier is now SCANNED, and its raw utility passes only because a cited SANCTIONED_HOMES row covers it",
    },
    {
      files: `const x = <div className="${Z_TOKEN_NAMES.map((name) => `z-(--z-${name})`).join(" ")}" />;`,
      at: "packages/client/src/test.tsx",
      why: "every recommended semantic token class passes the carrier check",
    },
    {
      files: {
        [ANCHOR]: "export const tokens = {};\n",
        [TOKEN_SOURCE]: `{"z":{${Z_TOKEN_NAMES.map((name) => `"${name}":{}`).join(",")}}}\n`,
        "packages/ui/src/layout/stack.tsx": "export const S = null;\n",
        "packages/ui/src/markdown/render.tsx": "export const M = null;\n",
      },
      why: "both homes STILL EARNED, judged against the real-tree anchor: each resolves to a live file, so the tripwire stays quiet",
    },
  ],
};
