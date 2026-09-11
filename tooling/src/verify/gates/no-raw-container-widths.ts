import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  'raw content width in className (w-N / max-w-N / w-[len]) — content widths ride the container scale: wrap in `<Container size="sm|md|lg">` (→ max-w-cq-*), never a hardcoded length. See docs/architecture/core/UI-Architecture-and-Layout.md §4.';

const WIDTH_RE = /^(?:(?:max-|min-)?w-\[[^\]]+\]|(?:max-)?w-(?:[1-9]\d*|\d+\.\d+))$/u;
const WHITESPACE_RE = /\s+/u;

interface BannedWidth {
  readonly token: string;
  readonly offset: number;
}

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

export const gate = defineGate({
  id: "no-raw-container-widths",
  family: "no-raw-container-widths",
  authority: "ordinary",
  severity: "error",
  // The legacy predicate admitted @client/@ui and subtracted the two primitive homes that IMPLEMENT the
  // container-width scale — `notUnder` is the non-lossy replacement for that exclusion.
  population: { in: ["@client", "@ui"], notUnder: ["packages/ui/src/layout/**", "packages/ui/src/markdown/**"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: 'wrap in <Container size="sm|md|lg"> instead of hardcoded length',
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.StringLiteral, SyntaxKind.NoSubstitutionTemplateLiteral],
        visit: (node) => {
          const hits = bannedWidthTokens(node.getText());
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
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="w-[600px]" />;\n' },
      expect: { count: 1 },
      why: "w-[len]",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="max-w-96" />;\n' },
      expect: { count: 1 },
      why: "max-w-96",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="w-1/2" />;\n' },
      why: "w-1/2 is allowed",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="w-full" />;\n' },
      why: "w-full is allowed",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="min-w-24" />;\n' },
      why: "min-w floors are allowed",
    },
  ],
});
