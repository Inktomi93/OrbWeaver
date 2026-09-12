// Gate: no-raw-container-widths (UI-Architecture-and-Layout.md §4) — a hardcoded content width anywhere it
// can reach the DOM as a class.
//
// THE SCAN IS UNFENCED (decided 2026-09-11, #1954): the visitor subscribes to every StringLiteral /
// NoSubstitutionTemplateLiteral in the population and applies NO className/cn() ancestry test. That is
// deliberate, and it is the same call `no-color-literals` records in its own header — in this repo the
// majority of class strings never appear in a `className=` attribute at all: they live in `tv()` variant
// maps, `cva`-style records, `cn()` argument lists and plain exported constants, and a carrier fence would
// blind the gate to exactly that surface. The WIDTH_RE shape (`w-<digits>` / `max-w-[len]`) is
// self-identifying enough to carry the unfenced scan's false-positive cost.
//
// The message used to assert the hit was "in className" — a context nothing ever verified, and false for
// every tv()/constant hit this gate exists to catch. It is now context-free. The unfenced behaviour is
// pinned by the non-JSX `mustFlag` row below, which is the whole point of stating it here: a header
// claiming a fence the visitor never applies is a defect, and so is one claiming a scan nothing proves.
//
// This policy is ORDINARY, so the false positive has a door — `@orb-waive no-raw-container-widths(<the
// offending class fragment>): <reason>` — and the reported position IS that fragment, not the literal.
//
// FAMILY: a declared SINGLETON under its own id. The class-fragment split it performs is the same SHAPE as
// `no-color-literals`' and `no-off-token-radius-shadow`'s, but each carries its own private token
// vocabulary and none shares a `lib/` reader — a shape is not a family, and no sibling policy judges
// content WIDTH. A merge is a real future candidate for the three, not forced here.
// POPULATION PORT: an INTENTIONAL CORRECTION, and the subtraction is the whole of it. The legacy descriptor
// (`d6f36904f`, the commit before the split at `99b7429e2`) admitted `packages/client/src` +
// `packages/ui/src` and excluded the two primitive homes that IMPLEMENT the container scale; `notUnder:
// ["packages/ui/src/layout/**", "packages/ui/src/markdown/**"]` is the non-lossy replacement for that
// exclusion. It removes 24 real files from judgement, which is why it carries its own two-file `mustPass`.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  'raw content width class (w-N / max-w-N / w-[len]) — content widths ride the container scale: wrap in `<Container size="sm|md|lg">` (→ max-w-cq-*), never a hardcoded length. See docs/architecture/core/UI-Architecture-and-Layout.md §4.';

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
  fix:
    'wrap in <Container size="sm|md|lg"> instead of hardcoded length. A deliberate site is waived with ' +
    "`@orb-waive no-raw-container-widths(<position>): <reason>` on the line above, where <position> is the " +
    "raw width utility class token itself (e.g. `w-[600px]`, `max-w-96`).",
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
      expect: { count: 1, token: "w-[600px]" },
      why: "w-[len] — and the reported position is the class FRAGMENT, not the enclosing literal, which is what makes the ordinary waiver door spellable",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="max-w-96" />;\n' },
      expect: { count: 1, token: "max-w-96" },
      why: "max-w-96",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.ts": 'export const widths = { wide: "max-w-96" };\n' },
      expect: { count: 1, token: "max-w-96" },
      why: "THE UNFENCED SCAN (#1954): a bare class string in a plain record — no className attribute, no cn()/tv() call, no JSX in the file at all — still bites. This row is the pin for the header's unfenced claim; without it the gate could grow a carrier fence and every proof would stay green while tv() variant maps went unpoliced.",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <div className="mx-auto max-w-96 rounded" />;\n' },
      expect: { count: 1, token: "max-w-96" },
      why: "THE PER-CLASS SPLIT, which every row above leaves unexercised because each of their literals is ONE class: a real class string is a whitespace-joined list, and `bannedWidthTokens` splits it, matches `WIDTH_RE` against each PART, and reports the offending fragment at its own offset — never the whole literal. DIRECTION: drop the split and this cut flags LESS (the joined text matches nothing and the row goes 1 → 0), which is the shape a count-only row on a single-class fixture cannot see. The `token` is what makes the ordinary waiver door spellable at the right position",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/ui/src/layout/container.tsx": 'export const C = <div className="max-w-96" />;\n',
        "packages/client/src/features/x/ok.tsx": 'export const G = <div className="w-full" />;\n',
      },
      why: "THE `notUnder` SUBTRACTION, and it excludes 24 real files from judgement with nothing pinning it: `packages/ui/src/layout/**` and `packages/ui/src/markdown/**` IMPLEMENT the container-width scale, so the hardcoded length that `mustFlag[1]` reports is the primitive's own definition there. Drop the subtraction and this row flags. TWO FILES BY NECESSITY: a fixture living entirely inside the subtraction leaves the population empty and comes back a `[population]` TOOL ERROR, not a finding — so the admitted client file is the anchor that makes the run a measurement",
    },
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
