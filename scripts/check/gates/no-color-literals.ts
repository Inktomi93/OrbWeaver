import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE_NON_TOKEN =
  "named non-token color in className (bg-black/bg-white/…-black/…-white) — D43 / UI-Gates-and-Lessons.md §11.4: use a theme token; for overlays use bg-scrim (a bg-black/50 scrim is invisible on a true-black theme).";
const MESSAGE_HEX =
  "arbitrary hex color in className/cn() — use a design token from theme.css (bg-card, text-foreground, text-success, text-destructive, etc.). Theme switching breaks with literal hex. See docs/architecture/core/UI-Architecture-and-Layout.md.";

const NON_TOKEN_RE = /\b(bg|text|border|ring|fill|stroke)-(black|white)(\/\d+)?\b/u;
const HEX_RE = /-\[#[0-9a-fA-F]{3,8}\]/u;
const WHITESPACE_RE = /\s+/u;

type BannedColor = { readonly token: string; readonly offset: number; readonly message: string };

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
      } else if (HEX_RE.test(part)) {
        out.push({ token: part, offset: at + 1, message: MESSAGE_HEX });
      }
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "no-color-literals",
  docRow: "UI-Architecture-and-Layout.md / D43",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE_HEX,
  fix: "use a design token (bg-card, text-foreground, text-success, text-destructive).",
  scanRoot: (p) => p.startsWith("packages/client/src") || p.startsWith("packages/ui/src"),
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
  visit: (node, _sf, ctx) => {
    // Ignore line suppressions manually if needed? ts-morph visit won't trigger if node has biome-ignore?
    // Wait, the ts-morph harness handles biome-ignore? We don't have to worry.
    const hits = bannedColorTokens(node.getText());
    for (const hit of hits) {
      ctx.report(node, hit);
    }
  },
  mustFlag: [
    {
      files: 'export const G = <div className="text-[#abc]" />;\n',
      at: "packages/client/src/x.tsx",
      expect: { count: 1 },
      why: "arbitrary hex color",
    },
    {
      files: 'export const G = <div className="bg-black" />;\n',
      at: "packages/ui/src/x.tsx",
      expect: { count: 1 },
      why: "named non-token color",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <div className="text-foreground" />;\n',
      at: "packages/client/src/ok.tsx",
      why: "design token",
    },
  ],
};
