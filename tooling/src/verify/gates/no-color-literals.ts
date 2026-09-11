import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE_NON_TOKEN =
  "named non-token color in className (bg-black/bg-white/…-black/…-white) — D43 / UI-Gates-and-Lessons.md §11.4: use a theme token; for overlays use bg-backdrop (a bg-black/50 scrim is invisible on a true-black theme).";
const MESSAGE_HEX =
  "arbitrary hex color in className/cn() — use a design token from theme.css (bg-card, text-foreground, text-success, text-destructive, etc.). Theme switching breaks with literal hex. See docs/architecture/core/UI-Architecture-and-Layout.md.";
const MESSAGE_PALETTE =
  "Tailwind PALETTE-scale color in className (e.g. text-red-500 / bg-blue-300) — D43 / UI-Architecture-and-Layout.md: a hardcoded palette scale bypasses the theme; use a semantic token (text-destructive, text-success, bg-primary, border-border, …). Theme switching + a true-black theme both break with a fixed palette step.";

const NON_TOKEN_RE = /\b(bg|text|border|ring|fill|stroke)-(black|white)(\/\d+)?\b/u;
// Tailwind's built-in palette scales (the 22 named ramps × a 50–950 step) — never a semantic token, which
// has no numeric step (bg-primary, text-foreground). A theme token can never take this shape, so the scan is
// UNFENCED (no className/cn() ancestry needed — the `-<ramp>-<step>` shape is self-identifying).
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
