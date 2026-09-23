// Gate: no-off-token-radius-shadow. `no-arbitrary-tw-values` only
// catches arbitrary VALUES (`rounded-[3px]`); a DEFAULT-SCALE utility (`rounded-lg`, `shadow-md`, bare
// `shadow`) resolves against Tailwind's stock scale, not the DTCG theme's own closed radius/shadow
// vocabulary — a verified gate blind spot (command-palette-surface.tsx shipped `rounded-lg` clean).
// Scoped to class-string call sites only (JSX `className=`, or a `cn`/`clsx`/`cva`/`tv` arg) — `shadow`/`rounded-lg` are ordinary English too.
//
// FINAL-CONTRACT CONVERSION (#1584): the legacy ALLOWLIST/stale-arm ratchet retired with NO ROWS TO
// PORT — it had been EMPTY since the DC8 overlay-primitive retrofit wave paid down its last survivor —
// so there is nothing for the central `ordinary` marker/grant reconciliation to inherit. A future
// legitimate off-token site is suppressed with `@orb-waive no-off-token-radius-shadow(<position>):
// <reason>` at the exact offending token, not a re-grown file table. FAMILY: `tailwind-class-token`, shared
// reader `lib/tailwind-class-token.ts`. The reader owns whitespace offsets and bracket-aware terminal
// parsing; this policy deliberately classifies the authored terminal before important normalization to
// preserve its existing vocabulary, and keeps its carrier fence and per-token reports.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readTailwindClassTokens } from "../lib/tailwind-class-token.ts";

const MESSAGE =
  "off-token default-scale radius/shadow utility (tokens: packages/ui/src/tokens/tokens.json) — resolves against " +
  "Tailwind's stock scale, not the DTCG theme: use a themed radius (rounded-base/control/card/full) " +
  "or shadow (shadow-glow/overlay/prose), per tokens.json.";

/** The concrete remedy (§9.2), printed ONCE under the group header (owner rulings 2/3). */
const FIX =
  "rounded-lg → rounded-card (or rounded-base/rounded-control/rounded-full); shadow-md → shadow-overlay " +
  "(or shadow-glow/shadow-prose) — see tokens.json radius/shadow vocab. A " +
  "deliberate off-token site is waived with `// @orb-waive no-off-token-radius-shadow(<position>): <reason>` " +
  "on a line above the offending statement, where <position> is the BARE WHITESPACE-SPLIT CLASS TOKEN WITH " +
  'NO QUOTES — `rounded-lg`, not "rounded-lg" — and INCLUDES any variant prefix — `hover:shadow-lg`, not ' +
  "`shadow-lg` — because the report passes `token: hit.token`, the raw split segment before the variant " +
  "strip. Each banned token is its own finding, so a `className` with two off-token utilities needs two " +
  "markers.";

const RADIUS_SCALE_RE = /^rounded-(?:sm|md|lg|xl|2xl|3xl|4xl)$/u;
const SHADOW_SCALE_RE = /^shadow(?:-(?:sm|md|lg|xl|2xl|3xl|inner))?$/u;

/** Is this whitespace-split class token a banned off-token radius/shadow default-scale utility
 *  (terminal segment after stripping variant modifiers)? */
function isBannedScale(terminal: string): boolean {
  return RADIUS_SCALE_RE.test(terminal) || SHADOW_SCALE_RE.test(terminal);
}

/** A single banned token + its 0-based char offset into the ENCLOSING NODE's text (one past the leading
 *  delimiter). Per-occurrence granularity (owner ruling 1): a `className="rounded-lg shadow-md"` yields
 *  TWO of these, each landing the caret on its own token. */
interface BannedToken {
  readonly token: string;
  readonly offset: number;
}

/** Strip a template-literal part's delimiters: TemplateHead is \`text$\{, TemplateMiddle is
 *  \}text$\{, TemplateTail is \}text\`, NoSubstitutionTemplateLiteral is \`text\` — one
 *  backtick-or-brace char off each end in every case. */
/** Every banned class token in a class-string-carrier node's text, with its offset into `node.getText()`.
 *  Splits on whitespace and tracks the running position so each token's column is exact. The leading `+1`
 *  accounts for the stripped delimiter (backtick / quote / `}` — always one char). */
function bannedTokens(nodeText: string): BannedToken[] {
  return readTailwindClassTokens(nodeText)
    .filter((part) => isBannedScale(part.terminal))
    .map(({ token, offset }) => ({ token, offset }));
}

const CLASS_STRING_CALLEES: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv"]);

/** Is this literal/template-part a class-string carrier — a JSX `className=` attribute value, or a
 *  string/template arg (at any nesting depth, e.g. inside a `tv({slots:{...}})` object literal) inside
 *  a `cn`/`clsx`/`cva`/`tv` call? Scoped this way (not "every string in the file") because `shadow` and
 *  `rounded-lg` are ordinary English/UI-copy tokens too ("Prose shadow" label, a `keywords: [...]`
 *  search entry) — unlike the bracket shape `no-arbitrary-tw-values` scans unscoped. Both ancestor
 *  lookups walk UP from the node delivered to the visitor, never down into a subtree. */
function isClassStringSite(node: Node): boolean {
  const jsxAttr = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsxAttr !== undefined && jsxAttr.getNameNode().getText() === "className") {
    return true;
  }
  const call = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  if (call === undefined) {
    return false;
  }
  const callee = call.getExpression().getText();
  return CLASS_STRING_CALLEES.has(callee);
}

export const gate = defineGate({
  id: "no-off-token-radius-shadow",
  family: "tailwind-class-token",
  authority: "ordinary",
  severity: "error",
  population: ["@client", "@ui"],
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [
          SyntaxKind.StringLiteral,
          SyntaxKind.NoSubstitutionTemplateLiteral,
          SyntaxKind.TemplateHead,
          SyntaxKind.TemplateMiddle,
          SyntaxKind.TemplateTail,
        ],
        // PER-TOKEN (owner ruling 1): a className with N banned tokens emits N findings, each landing
        // the caret on its own token via the node-text offset.
        visit: (node) => {
          if (!isClassStringSite(node)) {
            return;
          }
          for (const hit of bannedTokens(node.getText())) {
            ctx.report.node(node, { token: hit.token, offset: hit.offset });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/ui/src/x/x.tsx": 'export const G = <div className="rounded-lg shadow-md" />;\n' },
      // PER-TOKEN: the two banned tokens (rounded-lg + shadow-md) are TWO findings, not one.
      expect: { count: 2 },
      why: "the DC8 blind spot itself: stock-scale radius+shadow in a className → one finding per token",
    },
    {
      mode: "source",
      files: {
        // biome-ignore lint/suspicious/noTemplateCurlyInString: gate self-proof fixture, not a template.
        "packages/ui/src/x/variants.ts": "export const v = tv({ base: `shadow-lg \\${MOTION}` });\n",
      },
      expect: { count: 1, token: "shadow-lg" },
      why: "interpolated template PART (TemplateHead) inside tv() — the case a plain-string scan misses",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/bare.tsx": 'export const G = <div className="shadow" />;\n' },
      expect: { count: 1, token: "shadow" },
      why: "bare `shadow` (no scale suffix) is a default-scale utility — flags",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/variant.tsx": 'export const G = <div className="hover:shadow-lg" />;\n' },
      expect: { count: 1, token: "hover:shadow-lg" },
      why: "a variant-prefixed off-token shadow (hover:shadow-lg) — the terminal segment still flags",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/preset/components/thing.tsx": 'export const G = <div className="rounded-lg shadow-md" />;\n' },
      // PER-TOKEN: two banned tokens → two findings; the preset lane is scanned like any other feature file.
      expect: { count: 2 },
      why: "the preset lane is scanned like any other feature file (its mid-revamp carve-out was retired)",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/drop.tsx": 'export const G = <div className="drop-shadow-sm" />;\n' },
      why: "drop-shadow-* is a filter utility (a different CSS property/namespace) — out of scope, passes",
    },
    {
      mode: "source",
      files: { "packages/ui/src/x/x.tsx": 'export const G = <div className="rounded-card shadow-overlay" />;\n' },
      why: "the themed vocabulary passes untouched",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/copy.ts": 'export const label = "Prose shadow";\n' },
      why: "'shadow' as UI copy outside a class-string site — the false positive this gate scopes against",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/components/x.tsx": 'export const G = <div className="rounded-none shadow-none" />;\n' },
      why: "none = deliberate opt-out keyword, excluded from the banned scale",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/title.tsx": 'export const G = <div title="rounded-lg" />;\n' },
      why: 'THE className ATTRIBUTE-IDENTITY HALF (v-audit-wave4 D1): the banned utility inside a NON-className JSX attribute must not flag — `isClassStringSite` requires the attribute name to be exactly `className`, not merely `jsxAttr !== undefined`. Narrowing `=== "className"` to any JSX attribute reds this row.',
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/desc.ts": 'describe("rounded-lg card corners");\n' },
      why: "THE CLASS_STRING_CALLEES-MEMBERSHIP HALF (v-audit-wave4 D1): the banned utility as an argument to an ARBITRARY call (`describe`, not `cn`/`clsx`/`cva`/`tv`) must not flag — `isClassStringSite` requires the callee to be a member of `CLASS_STRING_CALLEES`, not merely `call !== undefined`. Widening the composer check to any call expression reds this row.",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/single.tsx":
          '// @orb-waive no-off-token-radius-shadow(rounded-lg): a stand-in reason and its end condition.\nexport const G = <div className="rounded-lg" />;\n',
      },
      why: "THE ORDINARY IDENTITY ARM (v-audit-wave4 D2, §4.2): the correct central marker at the reported BARE token `rounded-lg` (no quotes, no variant prefix, because the report passes `token: hit.token` for a single-token className with no other banned segment) suppresses the sole finding. One finding, one marker, zero effective findings and zero authority alarms; a wrong position, a foreign policy id or an over-broad match each fail this row through `toolFailure`.",
    },
  ],
});
