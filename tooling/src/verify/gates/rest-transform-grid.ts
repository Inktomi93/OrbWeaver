// Gate: rest-transform-grid (docs/design/integer-line-boxes.md §9, Law 2) — the AUTHORSHIP-provable half of
// rest-state transform identity: at REST an element must not carry a transform that resamples its own
// raster. ARM S: a rest-state `scale-*` other than `scale-100` (a permanent sub-pixel resample of the whole
// subtree). ARM C: a `transform`/`translate`/`scale` declaration OUTSIDE `@keyframes` whose value carries a
// fractional px length or a percentage. ARM B: the blindness tripwires. Comment posture: ARM S is AST-side
// via the static-class walker (comment-safe); ARM C reads parsed CSS declarations, and the parser blanks
// comment spans before parsing, so a commented-out rule is never judged.
//
// DECLARED LIMITS (each a mustPass row): a fractional-px arbitrary TRANSLATE utility is already RED under
// `no-arbitrary-tw-values` (its SCOPED_UTILITY_RE names `translate(-x|-y|-z)?`), and a PERCENTAGE translate
// is a runtime fraction of the element's own box — neither is re-judged here; both land at resolved-pixel
// time on ui-audit's `off-grid-transform` rule. A STATE-prefixed class token, a state-KEYED stylesheet rule
// (attribute-value or state-pseudo-class selector) and an @keyframes/@starting-style block are all MOTION,
// not rest — one classification, both arms.
//
// FAMILY: `static-class-expression`, after the shared reader
// `lib/static-class-expression.ts#walkStaticClassExpressions`, with `integer-line-boxes` as the second
// member. That reader is what ARM S — the founding arm, and the only one that can see a class string
// composed through `tv()` slots, `cn()` calls or a JSX binding — could not be written without. The module
// also calls `lib/css-rules.ts#atRulesContaining` for ARM C's ancestry test, shared with
// `motion-token-purity`; a policy has ONE family and it names the reader that decides its subject, not
// every reader it touches.
//
// POPULATION PORT (legacy `0acf26cb8`), two halves and both byte-identical:
//   · the AST half was `scanRoot: (path) => path.startsWith("packages/ui/src/") || path.startsWith("packages/client/src/")`
//     plus the same predicate re-applied to `ctx.files`; `{ in: ["@client", "@ui"] }` is exactly those two
//     roots (`contract/population.ts`), so the double filter collapses into the declaration.
//   · the CSS half globbed `packages/ui/src/**/*.css` + `packages/client/src/**/*.css`; `authored-css` is
//     exactly every `.css` under those two trees (`ops/resource-tree.ts:84-107`).
//
// AUTHORITY: `hard`, ported. The legacy descriptor carried NO allowlist, no exemption table and no marker
// grammar — the escape this gate offers is in the CODE (`scale-100`, a state prefix, a @keyframes stop),
// which is why there was never a table. A `hard` policy is the contract shape that says exactly that, and
// it is also what lets the fail-closed `unresolved` arm keep a DESCRIPTIVE position instead of an exact
// text slice: an ordinary finding's token must slice the source at its reported column, which a reason
// string cannot do.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. A declared resource that comes back
// missing/empty/unresolved/malformed makes `resolveResourceDeclarations` (`lib/resource-declaration.ts:182`)
// THROW during the POPULATION phase, and the receipt phase withholds every consumer, both before
// `create`/`evaluate` run (guide §11 ruling 3). This module owns no not-ready branch: it reads the CSS
// inventory through `readyResourceValue`, whose throw asserts the runtime's own refusal already held. That
// also RETIRED the legacy "zero stylesheets read" blindness reason — an empty CSS corpus is now a
// population-phase TOOL ERROR, which is strictly louder than the finding it replaces.
import type { Node } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { CssDeclarationFact } from "../contract/resource-css.ts";
import type { AuthoredCssFile } from "../contract/resource-tree.ts";
import { atRulesContaining } from "../lib/css-rules.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import type { StaticClassSegment } from "../lib/static-class-expression.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";

const MESSAGE =
  "A REST-state transform that cannot land on the device-pixel grid — a resting scale resamples the whole " +
  "subtree's raster permanently, and a fractional/percentage rest translate lands the box between device " +
  "pixels, which is the measured config-panel blur one property over. Transforms belong to MOTION (a state " +
  "variant or a @keyframes stop), never to rest; see docs/design/integer-line-boxes.md §9 (Law 2).";
const FIX =
  "Move the transform behind the state that motivates it (`active:`/`data-*:`/`group-hover:`) or into a " +
  "@keyframes stop, or express the rest geometry as layout (inset/grid/flex) instead of a transform. A " +
  "rest scale is only legal at `scale-100`.";
/** Real-tree anchor: the blindness arms below are WHOLE-TREE claims, and a proof fixture holds only the
 *  files its row materializes, so a tiny census there is correct rather than blind. The anchor is a live
 *  `@ui` module inside this policy's own population, which also makes it a LEGAL finding anchor — the
 *  legacy descriptor reported these at the gate's own source file, which no final policy may do. */
const REAL_TREE_ANCHOR = "packages/ui/src/lib/class-merge.ts";
/** Real-tree floor for the blindness tripwire: below this the census is blind, not clean. */
const MIN_TRANSFORM_TOKENS = 8;

/** Variant prefixes that do NOT name a state: breakpoints/container queries, polarity, media features,
 *  pseudo-ELEMENTS and structural position. Everything else — `hover:`, `data-*:`, `group-*:`, `aria-*:`,
 *  `peer-*:`, `starting:`, an unrecognised prefix — is treated as motion and skipped, so this gate never
 *  judges a transform the author already scoped to a state. The conservative direction is deliberate: a
 *  missed state prefix costs coverage the ARM B floor still sees, while a mis-classified state prefix
 *  would red legitimate motion. */
const REST_VARIANTS: ReadonlySet<string> = new Set([
  "sm",
  "md",
  "lg",
  "xl",
  "2xl",
  "dark",
  "light",
  "print",
  "rtl",
  "ltr",
  "portrait",
  "landscape",
  "motion-safe",
  "motion-reduce",
  "forced-colors",
  "contrast-more",
  "contrast-less",
  "before",
  "after",
  "backdrop",
  "marker",
  "selection",
  "placeholder",
  "file",
  "first-letter",
  "first-line",
  "first",
  "last",
  "only",
  "odd",
  "even",
  "empty",
  "*",
  "**",
]);

/** A container-query prefix (`@md:`, `@min-[40rem]:`, `@md/name:`) is a viewport fact, never a state. */
const CONTAINER_VARIANT_RE = /^@/u;
const SUPPORTS_VARIANT_RE = /^(?:supports|min|max)-/u;

function isRestVariant(prefix: string): boolean {
  return REST_VARIANTS.has(prefix) || CONTAINER_VARIANT_RE.test(prefix) || SUPPORTS_VARIANT_RE.test(prefix);
}

interface ParseState {
  readonly stack: string[];
  quote: string;
  escaped: boolean;
}

function consumesQuoteOrEscape(state: ParseState, char: string): boolean {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char === "\\") {
    state.escaped = true;
    return true;
  }
  if (state.quote.length > 0) {
    if (char === state.quote) {
      state.quote = "";
    }
    return true;
  }
  if (char === '"' || char === "'") {
    state.quote = char;
    return true;
  }
  return false;
}

function consumesBracket(state: ParseState, char: string): boolean {
  const closes: Readonly<Record<string, string>> = { "]": "[", ")": "(", "}": "{" };
  if (char === "[" || char === "(" || char === "{") {
    state.stack.push(char);
    return true;
  }
  const open = closes[char];
  if (open === undefined) {
    return false;
  }
  if (state.stack.at(-1) === open) {
    state.stack.pop();
  }
  return true;
}

interface SplitToken {
  /** Variant prefixes in authored order, top-level colons only (a colon inside `[…]`/`(…)` is data). */
  readonly variants: readonly string[];
  /** The base utility, `!` important markers trimmed from both spellings. */
  readonly base: string;
}

function splitToken(token: string): SplitToken {
  const state: ParseState = { stack: [], quote: "", escaped: false };
  const variants: string[] = [];
  let start = 0;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index] ?? "";
    if (consumesQuoteOrEscape(state, char) || consumesBracket(state, char)) {
      continue;
    }
    if (char === ":" && state.stack.length === 0) {
      variants.push(token.slice(start, index));
      start = index + 1;
    }
  }
  return { variants, base: token.slice(start).replace(/^!/u, "").replace(/!$/u, "") };
}

/** Every transform-family utility, whatever its axis or sign — the census denominator ARM B floors. */
const TRANSFORM_UTILITY_RE = /^-?(?:translate|scale|rotate|skew)(?:-[xyz3d]+)?(?:-|$)/u;
const SCALE_UTILITY_RE = /^(?<sign>-?)scale(?:-(?<axis>[xyz]))?-(?<value>.+)$/u;
const SCALE_IDENTITY = "100";

interface ClassToken {
  readonly raw: string;
  readonly split: SplitToken;
  readonly offset: number;
}

function classTokens(value: string): ClassToken[] {
  const tokens: ClassToken[] = [];
  const wordRe = /\S+/gu;
  let match = wordRe.exec(value);
  while (match !== null) {
    tokens.push({ raw: match[0], split: splitToken(match[0]), offset: match.index });
    match = wordRe.exec(value);
  }
  return tokens;
}

interface AnchoredToken {
  readonly node: Node;
  readonly offset: number;
  readonly token: string;
}

function sourceToken(segments: readonly StaticClassSegment[], valueOffset: number, token: string): AnchoredToken | undefined {
  const segment = segments.find((part) => valueOffset >= part.valueStart && valueOffset < part.valueEnd) ?? segments[0];
  if (segment === undefined) {
    return;
  }
  return { node: segment.node, offset: segment.sourceStart + Math.max(0, valueOffset - segment.valueStart) - segment.node.getStart(), token };
}

interface TransformCensus {
  tokens: number;
}

interface CandidateScan {
  readonly ctx: GatePolicyContext;
  readonly census: TransformCensus;
  readonly segments: readonly StaticClassSegment[];
}

function judgeCandidate(scan: CandidateScan, value: string): void {
  for (const token of classTokens(value)) {
    if (!TRANSFORM_UTILITY_RE.test(token.split.base)) {
      continue;
    }
    scan.census.tokens += 1;
    if (!token.split.variants.every(isRestVariant)) {
      continue;
    }
    const scale = SCALE_UTILITY_RE.exec(token.split.base);
    if (scale?.groups === undefined || scale.groups["value"] === SCALE_IDENTITY) {
      continue;
    }
    // Anchor on the BASE utility, not on the whole class token: a variant-prefixed `md:-scale-x-105` has
    // its base three characters in, and a finding whose token does not slice the source at its reported
    // offset is an `[evaluate]` TOOL ERROR under the final runtime (the legacy descriptor never checked).
    const baseAt = token.raw.indexOf(token.split.base);
    const anchored = sourceToken(scan.segments, token.offset + Math.max(0, baseAt), token.split.base);
    if (anchored !== undefined) {
      scan.ctx.report.node(anchored.node, { token: anchored.token, offset: anchored.offset });
    }
  }
}

const TRANSFORM_PROPERTIES: ReadonlySet<string> = new Set(["transform", "translate", "scale"]);
/** Both at-rules whose blocks are ANIMATING landings, never rest ones: keyframe stops, and the entry/exit
 *  snapshot `@starting-style` takes before a transition runs. */
const ANIMATING_AT_RULE_RE = /^@(?:keyframes|starting-style)\b/u;
/** A CONDITIONAL rule — one keyed on an attribute VALUE or a state pseudo-class — is the stylesheet's
 *  spelling of a state variant, so its landing is MOTION/configuration and not a rest one. This is the same
 *  classification ARM S applies to `hover:`/`data-*:` prefixes; without it the two arms would disagree about
 *  what "rest" means, which is exactly what the live shell.css `[data-panel-mode="collapsed"]` off-screen
 *  panel rules proved at mint. The resolved landing of every conditional arm is still judged, at runtime,
 *  by ui-audit's `off-grid-transform` rule. */
const STATE_SELECTOR_RE = /\[[^\]]*=[^\]]*\]|:hover|:focus|:active|:checked|:disabled|:target|:open|:popover-open/u;
/** A landing this gate can prove is off the grid: a fractional px length, or a percentage of a box whose
 *  width is decided at layout time. A `var(…)`/`calc(…)` indirection is a DECLARED SKIP — the token behind
 *  it carries its own contract, and the resolved landing is ui-audit's `off-grid-transform` rule. */
const FRACTIONAL_PX_RE = /-?\d*\.\d+px/u;
const PERCENTAGE_RE = /-?\d*\.?\d+%/u;

/** Is this declaration a REST landing? An animating at-rule ANYWHERE in its ancestry disqualifies it, which
 *  is why the ancestry reader is needed rather than the declaration's own `owner`: a keyframe stop is owned
 *  by the style rule that spells its offset (`from`/`to`), and a starting-style landing by its own selector,
 *  so neither declaration's owner ever names the at-rule above it. The legacy descriptor answered the same
 *  question by brace-counting those spans out of the raw text; the parser already recorded both ends of
 *  every block, so the port is exact and owns no walk. */
function atRest(file: AuthoredCssFile, declaration: CssDeclarationFact): boolean {
  if (atRulesContaining(file.atRules, declaration.offset).some((atRule) => ANIMATING_AT_RULE_RE.test(atRule.prelude))) {
    return false;
  }
  const selectorList = declaration.owner.kind === "style-rule" ? declaration.owner.selectorList : "";
  return !STATE_SELECTOR_RE.test(selectorList);
}

function reportCssTransforms(ctx: GatePolicyContext, file: AuthoredCssFile, declarations: readonly CssDeclarationFact[]): void {
  for (const declaration of declarations) {
    if (!(TRANSFORM_PROPERTIES.has(declaration.property) && atRest(file, declaration))) {
      continue;
    }
    if (FRACTIONAL_PX_RE.test(declaration.value) || PERCENTAGE_RE.test(declaration.value)) {
      // THE CARRIER / COORDINATE SPLIT (#2107 arm c, guide §3). `translateX(-0.5px)` carries parentheses the
      // `@orb-waive` grammar cannot hold. This policy is `hard` so the trap is LATENT rather than live — a hard
      // finding has no waiver door at all — but authority is a field an owner can flip, and a position minted
      // under `hard` becomes silently unanswerable the day it does. The value is named in the message.
      const coordinate = waivableCoordinate(declaration.value);
      if (coordinate === undefined) {
        throw new Error(`transform value has no anchorable coordinate: ${declaration.value}`);
      }
      ctx.report.file(declaration.file, {
        line: declaration.line,
        column: declaration.column,
        token: coordinate,
        ...(coordinate === declaration.value ? {} : { message: `${MESSAGE} Value: ${declaration.value}.` }),
      });
    }
  }
}

interface BlindnessInputs {
  readonly roots: number;
  readonly census: TransformCensus;
}

/** ARM B. Anchored on a file inside this policy's own population, and only when that file is actually
 *  loaded: a whole-tree claim made over a proof fixture would say "blind" about a corpus that is small by
 *  construction. The legacy "zero stylesheets read" reason is gone — the resource runtime refuses an empty
 *  CSS corpus one phase earlier, and a tool error outranks a finding. */
function reportBlindness(ctx: GatePolicyContext, inputs: BlindnessInputs): void {
  const blind: string[] = [];
  if (inputs.roots === 0) {
    blind.push("static class-expression derivation returned zero carrier roots");
  }
  if (inputs.census.tokens < MIN_TRANSFORM_TOKENS) {
    blind.push(`transform-utility census below the real-tree floor (${String(inputs.census.tokens)} tokens)`);
  }
  for (const reason of blind) {
    ctx.report.file(REAL_TREE_ANCHOR, {
      line: 1,
      column: 1,
      message: `${reason} — the rest-transform census is blind, not clean (tooling/src/verify/gates/rest-transform-grid.ts)`,
    });
  }
}

/** Every proof row spreads this, and it is not decoration. `authored-css` is assembled from the
 *  `client-source` AND `ui-source` trees (`ops/resource-tree.ts:84-107`), so a row whose file map leaves
 *  either tree empty comes back a `[population]` TOOL ERROR — "resource tree has no members" — rather than
 *  a finding, and would prove nothing about the arm it was written for. The two members are the cheapest
 *  pair that makes both trees non-empty and gives the TS population one admitted file: neither carries a
 *  transform, so neither can mask or manufacture a row's verdict. */
const CORPUS = {
  "packages/client/src/styles/keep.css": ".keep {\n  color: var(--color-foreground);\n}\n",
  "packages/ui/src/keep.tsx": "export const Keep = () => null;\n",
} as const;

export const gate = defineGate({
  id: "rest-transform-grid",
  family: "static-class-expression",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@ui"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-css" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const inventory = readyResourceValue(ctx.resources.cssInventory("authored"));
      const walked = walkStaticClassExpressions(ctx.files);
      const census: TransformCensus = { tokens: 0 };
      for (const candidate of walked.candidates) {
        judgeCandidate({ ctx, census, segments: candidate.segments }, candidate.value);
      }
      for (const unresolved of walked.unresolved) {
        ctx.report.node(unresolved.node, { message: `${MESSAGE} (class expression unresolved: ${unresolved.reason})` });
      }
      const declarationsByFile = Map.groupBy(inventory.declarations, (declaration) => declaration.file);
      for (const file of inventory.files) {
        reportCssTransforms(ctx, file, declarationsByFile.get(file.path) ?? []);
      }
      if (ctx.files.some((source) => ctx.relativePath(source) === REAL_TREE_ANCHOR)) {
        reportBlindness(ctx, { roots: walked.roots, census });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-95 rounded-card" />;\n',
      },
      expect: { count: 1, token: "scale-95" },
      why: "the founding shape: a resting scale resamples every glyph in the subtree for the whole life of the element — the crispness doctrine's Law 2",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="md:-scale-x-105" />;\n',
      },
      expect: { count: 1, token: "-scale-x-105" },
      why: "a breakpoint is a viewport fact, not a state — the transform still rests at that width, and the sign/axis spellings must not evade the arm",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-[1.02]" />;\n',
      },
      expect: { count: 1, token: "scale-[1.02]" },
      why: "an arbitrary rest scale is the unprovable case, and `scale` is absent from no-arbitrary-tw-values' SCOPED_UTILITY_RE — nothing else on the ladder judges it",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/tv.ts": 'import { tv } from "tailwind-variants";\nexport const x = tv({ slots: { root: "px-2 scale-90" } });\n',
      },
      expect: { count: 1, token: "scale-90" },
      why: "tv slot strings are class carriers — the rest law must reach composed variants, not only JSX. This is the row the FAMILY rests on: nothing but `walkStaticClassExpressions` sees a class string that never appears in a className attribute",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css": ".x {\n  transform: translateX(-0.5px);\n}\n",
      },
      expect: { count: 1, line: 2, token: "translateX", messageIncludes: "Value: translateX(-0.5px)." },
      why: "a fractional px rest translate in a stylesheet lands the box between device pixels — the exact arithmetic Law 1 closed one property over",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css": ".x {\n  translate: -50% 0;\n}\n",
      },
      expect: { count: 1, line: 2, token: "-50% 0" },
      why: "a percentage rest translate is a fraction of a runtime box — at any odd width it lands off the grid, and the individual `translate` property must not be the hole in a `transform`-only matcher",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/nested.css": "@media (min-width: 40rem) {\n  .x {\n    transform: translateX(-0.5px);\n  }\n}\n",
      },
      expect: { count: 1, line: 3, token: "translateX", messageIncludes: "Value: translateX(-0.5px)." },
      why: "NARROWING ROW for the ancestry reader's DIRECTION: a non-animating at-rule must NOT exempt its children. A media query is a viewport fact — the same classification ARM S gives `md:` — so widening the ancestry test to 'any at-rule' turns this row green",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'let cls = "scale-95";\ncls = "p-2";\nexport const G = <div className={cls} />;\n',
      },
      expect: { count: 1, messageIncludes: "class expression unresolved: mutable class binding" },
      why: "the FAIL-CLOSED arm, and the only row that reaches it: a class expression the walker cannot resolve is 'I could not measure', never 'clean'. The `messageIncludes` is what makes it discriminating — the arm produces the same COUNT as an ordinary finding and differs only in message, so a bare `count` row would pass identically whether the arm fired or was unreachable",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="transition-[scale] active:scale-95 group-hover:scale-105 data-active:scale-95" />;\n',
      },
      why: "state-prefixed scales are MOTION, not rest — the live button/press idiom, and the whole reason this gate classifies variants instead of banning the utility",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-100 rotate-45 translate-y-2" />;\n',
      },
      why: "declared limits: identity scale is the escape, and a rest ROTATE (the overlay-arrow diamond) or a token-scale TRANSLATE is judged at resolved-pixel time by ui-audit's off-grid-transform rule, never here",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="before:-translate-x-1/2 after:-translate-y-1/2" />;\n',
      },
      why: "declared limit: a PERCENTAGE translate is a runtime fraction of the element's own box — unprovable from the class string, so the live centring idiom is the runtime rule's subject, not a static finding",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css":
          "@keyframes shimmer {\n  from {\n    transform: translateX(0);\n  }\n  to {\n    transform: translateX(100%);\n  }\n}\n",
      },
      why: "a @keyframes stop is an ANIMATING landing, not a rest one — the live skeleton-shimmer and indeterminate-hairline sweeps both ride 100% stops. The stop is owned by the style rule `to`, so this row is also what holds the at-rule ANCESTRY read: reading the declaration's own `owner` sees `to` and never the `@keyframes` prelude",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css": ".x {\n  transform: translateX(var(--drawer-swipe-movement-x));\n}\n",
      },
      why: "declared limit: a var()/calc() indirection carries the token's own contract — the resolved landing is ui-audit's off-grid-transform rule",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/extra.css":
          '.shell-panel[data-panel-mode="collapsed"] {\n  transform: translateX(-100%);\n}\n@starting-style {\n  .y {\n    translate: -50% 0;\n  }\n}\n',
      },
      why: "the live shell.css shape: a state-KEYED rule is the stylesheet's spelling of a state variant, and @starting-style is an entry snapshot — both are MOTION, the same classification ARM S gives `data-*:` prefixes",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/styles/commented.css": "/* .old {\n  transform: translateX(-0.5px);\n} */\n.x {\n  transform: translateX(0);\n}\n",
      },
      why: "COMMENT POSTURE: a commented-out rest translate is prose. The parser blanks comment spans before parsing, so a commented-out declaration never enters the inventory at all — the founding #117 class, one stylesheet family over",
    },
    {
      mode: "resource",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-100" />;\n',
      },
      why: "NARROWING ROW for the ARM B real-tree GUARD: the census here is 1 transform token, far below the floor of 8, and the walk found one root — so cutting the `REAL_TREE_ANCHOR` guard turns this silent row into a blindness finding on every fixture in the corpus. The guard is what stops a whole-tree claim being made over a file map that is small by construction",
    },
  ],
});
