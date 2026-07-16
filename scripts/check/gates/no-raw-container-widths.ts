import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  'raw content width in className (w-N / max-w-N / w-[len]) — content widths ride the container scale: wrap in `<Container size="sm|md|lg">` (→ max-w-cq-*), never a hardcoded length. See docs/architecture/core/UI-Architecture-and-Layout.md §4.';

const WIDTH_RE = /^(?:(?:max-|min-)?w-\[[^\]]+\]|(?:max-)?w-(?:[1-9]\d*|\d+\.\d+))$/u;
const WHITESPACE_RE = /\s+/u;

type BannedWidth = { readonly token: string; readonly offset: number };

function bannedWidthTokens(nodeText: string): BannedWidth[] {
  const stripped = nodeText.slice(1, -1);
  const out: BannedWidth[] = [];
  const parts = stripped.split(WHITESPACE_RE);
  let cursor = 0;
  for (const part of parts) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0 && WIDTH_RE.test(part)) {
      out.push({ token: part, offset: at + 1 });
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "no-raw-container-widths",
  docRow: "UI-Architecture-and-Layout.md §4",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: 'wrap in <Container size="sm|md|lg"> instead of hardcoded length',
  scanRoot: (p) => {
    if (p.includes("packages/ui/src/layout/") || p.includes("packages/ui/src/markdown/")) {
      return false;
    }
    return p.includes("packages/client/src/") || p.includes("packages/ui/src/");
  },
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
  visit: (node, _sf, ctx) => {
    const hits = bannedWidthTokens(node.getText());
    for (const hit of hits) {
      ctx.report(node, hit);
    }
  },
  mustFlag: [
    {
      files: 'export const G = <div className="w-[600px]" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "w-[len]",
    },
    {
      files: 'export const G = <div className="max-w-96" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "max-w-96",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <div className="w-1/2" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      why: "w-1/2 is allowed",
    },
    {
      files: 'export const G = <div className="w-full" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      why: "w-full is allowed",
    },
    {
      files: 'export const G = <div className="min-w-24" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      why: "min-w floors are allowed",
    },
  ],
};
