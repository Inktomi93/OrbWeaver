import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "viewport breakpoint variant in a feature className (sm:/md:/lg:/xl:/2xl:/max-*:) — a feature adapts to its CONTAINER, not the viewport: use a `@container` variant (@md:) or `<Container size>`. Viewport `@media` lives only in features/app-shell. See docs/architecture/core/UI-Architecture-and-Layout.md §4b.";

const MEDIA_QUERY_RE = /^(?:(?:max-|min-)?(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\]]+\]):/u;
const WHITESPACE_RE = /\s+/u;

type BannedMediaQuery = { readonly token: string; readonly offset: number };

function bannedMediaQueryTokens(nodeText: string): BannedMediaQuery[] {
  const stripped = nodeText.slice(1, -1);
  const out: BannedMediaQuery[] = [];
  const parts = stripped.split(WHITESPACE_RE);
  let cursor = 0;
  for (const part of parts) {
    const at = stripped.indexOf(part, cursor);
    cursor = at + part.length;
    if (part.length > 0 && MEDIA_QUERY_RE.test(part)) {
      out.push({ token: part, offset: at + 1 });
    }
  }
  return out;
}

export const gate: GateDescriptor = {
  name: "no-media-queries-in-features",
  docRow: "UI-Architecture-and-Layout.md §4b",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "use container queries (@md:) or <Container size>",
  scanRoot: (p) => {
    if (p.includes("packages/client/src/features/app-shell/")) {
      return false;
    }
    return p.includes("packages/client/src/") || p.includes("packages/ui/src/");
  },
  kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
  visit: (node, _sf, ctx) => {
    const hits = bannedMediaQueryTokens(node.getText());
    for (const hit of hits) {
      ctx.report(node, hit);
    }
  },
  mustFlag: [
    {
      files: 'export const G = <div className="md:flex-row" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "viewport media query used",
    },
  ],
  mustPass: [
    {
      files: 'export const G = <div className="@md:flex-row" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      why: "container query is allowed",
    },
    {
      files: 'export const G = <div className="md:flex-row" />;\n',
      at: "packages/client/src/features/app-shell/x.tsx",
      why: "allowed in app-shell",
    },
  ],
};
