// Gate: no-color-literals (D43, UI-Architecture-and-Layout.md, UI-Gates-and-Lessons.md §11.4). Three
// patterns — a named non-token color, a Tailwind palette scale, an arbitrary hex — banned anywhere they
// can reach the DOM as a class.
//
// THE SCAN IS UNFENCED FOR ALL THREE PATTERNS (decided 2026-09-11, #1954): the visitor subscribes to every
// StringLiteral / NoSubstitutionTemplateLiteral in the population and applies no className/cn() ancestry
// test to any pattern. That is deliberate, not an oversight — in this repo the majority of class strings
// never appear in a `className=` attribute at all: they live in `tv()` variant maps, `cva`-style records,
// `cn()` argument lists and plain exported constants, and a JSX-carrier fence would blind the gate to
// exactly that surface. The header used to single PALETTE_RE out as "UNFENCED" while MESSAGE_NON_TOKEN and
// MESSAGE_HEX asserted the hit was "in className" — a context nothing ever verified. The messages are now
// context-free; the unfenced behaviour is pinned by the non-JSX mustFlag row below.
//
// THAT SENTENCE USED TO CITE A REAL-TREE PIN, AND THE CITATION IS DEAD (#1974, 2026-09-11). It named
// tests/tooling/gate-ignore-grammar.repo.int.test.ts, "whose whole six-case probe rests on this gate
// biting a bare exported `bg-black` class constant under packages/ui/src". That suite exercises the LEGACY
// `@orb-gate-ignore` engine, and marker routing is FENCED (docs/design/gate-runtime-standardization.md
// §7): its carriers must be LEGACY gates BY REQUIREMENT. This module converted at `99b7429e2`, left the
// legacy roster, and took that pin with it — the suite went RED, unrun for days because tests/tooling/**
// is `--full`-only (#1842), and has since been re-pointed at a still-legacy carrier. This module's own
// receipt is its `defineGate` proof rows on `structure:policy-conformance` plus its family test; do not
// re-add a real-tree citation to a suite whose subject is the engine this policy no longer uses.
//
// The cost is accepted: a non-class string that happens to spell `bg-black` or `text-red-500` is a false
// positive. This policy is ORDINARY precisely so that case has a door — `@orb-waive no-color-literals(<the
// offending token>): <reason>` — and the position token is the offending class fragment, not the literal.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE_NON_TOKEN =
  "named non-token color class (bg-black/bg-white/…-black/…-white) — D43 / UI-Gates-and-Lessons.md §11.4: use a theme token; for overlays use bg-backdrop (a bg-black/50 scrim is invisible on a true-black theme).";
const MESSAGE_HEX =
  "arbitrary hex color class (…-[#rrggbb]) — use a design token from theme.css (bg-card, text-foreground, text-success, text-destructive, etc.). Theme switching breaks with literal hex. See docs/architecture/core/UI-Architecture-and-Layout.md.";
const MESSAGE_PALETTE =
  "Tailwind PALETTE-scale color class (e.g. text-red-500 / bg-blue-300) — D43 / UI-Architecture-and-Layout.md: a hardcoded palette scale bypasses the theme; use a semantic token (text-destructive, text-success, bg-primary, border-border, …). Theme switching + a true-black theme both break with a fixed palette step.";

const NON_TOKEN_RE = /\b(bg|text|border|ring|fill|stroke)-(black|white)(\/\d+)?\b/u;
// Tailwind's built-in palette scales (the 22 named ramps × a 50–950 step) — never a semantic token, which
// has no numeric step (bg-primary, text-foreground). The `-<ramp>-<step>` shape is self-identifying, which
// is why this pattern carries the lowest false-positive cost of the three; the scan itself is unfenced for
// all three (see the module header).
const PALETTE_RE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|divide|placeholder|shadow|ring-offset)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}(?:\/\d+)?\b/u;
const HEX_RE = /-\[#[0-9a-fA-F]{3,8}\]/u;
const WHITESPACE_RE = /\s+/u;

interface BannedColor {
  readonly token: string;
  readonly offset: number;
  readonly message: string;
}

function bannedColorTokens(nodeText: string): BannedColor[] {
  const stripped = nodeText.slice(1, -1);
  const out: BannedColor[] = [];
  const parts = stripped.split(WHITESPACE_RE);
  let cursor = 0;
  for (const part of parts) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0) {
      if (NON_TOKEN_RE.test(part)) {
        out.push({ token: part, offset: at + 1, message: MESSAGE_NON_TOKEN });
      } else if (PALETTE_RE.test(part)) {
        out.push({ token: part, offset: at + 1, message: MESSAGE_PALETTE });
      } else if (HEX_RE.test(part)) {
        out.push({ token: part, offset: at + 1, message: MESSAGE_HEX });
      }
    }
  }
  return out;
}

export const gate = defineGate({
  id: "no-color-literals",
  family: "no-color-literals",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE_HEX,
  fix: "use a design token (bg-card, text-foreground, text-success, text-destructive).",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node) => {
          const hits = bannedColorTokens(node.getText());
          for (const hit of hits) {
            ctx.report.node(node, hit);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/x.tsx": 'export const G = <div className="text-[#abc]" />;\n' },
      expect: { count: 1 },
      why: "arbitrary hex color",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x.tsx": 'export const G = <div className="bg-black" />;\n' },
      expect: { count: 1 },
      why: "named non-token color",
    },
    {
      mode: "source",
      files: { "packages/client/src/palette.tsx": 'export const G = <div className="text-red-500" />;\n' },
      expect: { count: 1 },
      why: "a Tailwind palette scale (text-red-500) — the tighten's new arm: a fixed palette step bypasses the theme, RED",
    },
    {
      mode: "source",
      files: { "packages/ui/src/palette-multi.tsx": 'export const G = <div className="rounded-md border bg-blue-300/50 ring-emerald-600" />;\n' },
      expect: { count: 2 },
      why: "two palette-scale tokens (bg-blue-300/50 with an opacity step + ring-emerald-600) in one className — one finding PER offending token, RED",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/variants.ts": 'export const badge = { variants: { tone: { danger: "bg-red-500 text-white", ghost: "text-[#abc]" } } };\n',
      },
      expect: { count: 3, token: "bg-red-500" },
      why: "THE UNFENCED DECISION (#1954): a tv()-style variant map in a .ts file — no JSX, no className attribute, no cn() call anywhere — and ALL THREE patterns still bite (palette bg-red-500, non-token text-white, hex text-[#abc]). This is where most class strings in this repo actually live, so a className/cn ancestry fence would be a hole, not a narrowing; the messages must therefore not assert a className context",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/ok.tsx": 'export const G = <div className="text-foreground" />;\n' },
      why: "design token",
    },
    {
      mode: "source",
      files: { "packages/client/src/ok-semantic.tsx": 'export const G = <div className="bg-primary text-muted-foreground border-border" />;\n' },
      why: "semantic theme tokens (bg-primary / text-muted-foreground / border-border) have no numeric palette step — the palette arm must NOT catch them, passes",
    },
  ],
});
