import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "viewport breakpoint variant in a feature className (sm:/md:/lg:/xl:/2xl:/max-*:) — a feature adapts to its CONTAINER, not the viewport: use a `@container` variant (@md:) or `<Container size>`. Viewport `@media` lives only in features/app-shell. See docs/architecture/core/UI-Architecture-and-Layout.md §4b.";

const MEDIA_QUERY_RE = /^(?:(?:max-|min-)?(?:sm|md|lg|xl|2xl)|(?:min|max)-\[[^\]]+\]):/u;
const WHITESPACE_RE = /\s+/u;

interface BannedMediaQuery {
  readonly token: string;
  readonly offset: number;
}

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

export const gate = defineGate({
  id: "no-media-queries-in-features",
  family: "no-media-queries-in-features",
  authority: "ordinary",
  severity: "error",
  // The legacy predicate admitted @client/@ui and subtracted the whole app-shell subtree (the ONE feature
  // permitted to fork viewport @media) — `notUnder` is the non-lossy replacement for that exclusion.
  population: { in: ["@client", "@ui"], notUnder: ["packages/client/src/features/app-shell/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "use container queries (@md:) or <Container size>",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node) => {
          const hits = bannedMediaQueryTokens(node.getText());
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
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="md:flex-row" />;\n' },
      expect: { count: 1 },
      why: "viewport media query used",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="@md:flex-row" />;\n' },
      why: "container query is allowed",
    },
    {
      mode: "source",
      files: {
        // The app-shell file is excluded from the DECLARED population itself (`notUnder`), so it is never
        // visited — a companion in-population file keeps the fixture's admitted set nonempty.
        "packages/client/src/features/app-shell/x.tsx": 'export const G = <div className="md:flex-row" />;\n',
        "packages/client/src/features/y/clean.tsx": 'export const G = <div className="flex-row" />;\n',
      },
      why: "allowed in app-shell",
    },
  ],
});
