// Gate: rest-transform-grid (docs/design/integer-line-boxes.md §9, Law 2) — the AUTHORSHIP-provable half of
// rest-state transform identity: at REST an element must not carry a transform that resamples its own
// raster. ARM S: a rest-state `scale-*` other than `scale-100` (a permanent sub-pixel resample of the whole
// subtree). ARM C: a `transform`/`translate`/`scale` declaration OUTSIDE `@keyframes` whose value carries a
// fractional px length or a percentage. ARM B: blindness tripwires. Comment posture: ARM S is AST-side via
// the static-class walker (comment-safe); ARM C routes stylesheet text through blankCssComments. DECLARED
// LIMITS (each a mustPass row): a fractional-px arbitrary TRANSLATE utility is already RED under
// `no-arbitrary-tw-values` (its SCOPED_UTILITY_RE names `translate(-x|-y|-z)?`), and a PERCENTAGE translate
// is a runtime fraction of the element's own box — neither is re-judged here; both land at resolved-pixel
// time on ui-audit's `off-grid-transform` rule. A STATE-prefixed class token, a state-KEYED stylesheet rule
// (attribute-value or state-pseudo-class selector) and an @keyframes/@starting-style block are all MOTION,
// not rest — one classification, both arms.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Node } from "ts-morph";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import { blankCssComments } from "../lib/comment-spans.ts";
import { fileLoaded, repoRel } from "../lib/pass.ts";
import type { StaticClassSegment } from "../lib/static-class-expression.ts";
import { walkStaticClassExpressions } from "../lib/static-class-expression.ts";

const MESSAGE =
  "A REST-state transform that cannot land on the device-pixel grid — a resting scale resamples the whole " +
  "subtree's raster permanently, and a fractional/percentage rest translate lands the box between device " +
  "pixels, which is the measured config-panel blur one property over. Transforms belong to MOTION (a state " +
  "variant or a @keyframes stop), never to rest; see docs/design/integer-line-boxes.md §9 (Law 2).";
const FIX =
  "Move the transform behind the state that motivates it (`active:`/`data-*:`/`group-hover:`) or into a " +
  "@keyframes stop, or express the rest geometry as layout (inset/grid/flex) instead of a transform. A " +
  "rest scale is only legal at `scale-100`.";
const GATE_SELF = "tooling/src/verify/gates/rest-transform-grid.ts";
const REAL_TREE_ANCHOR = "packages/ui/src/lib/class-merge.ts";
const CSS_ROOTS = ["packages/ui/src", "packages/client/src"] as const;
/** Real-tree floors for the blindness tripwire: below these the census is blind, not clean. */
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
  readonly ctx: GateRunCtx;
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
    const anchored = sourceToken(scan.segments, token.offset, token.split.base);
    if (anchored !== undefined) {
      scan.ctx.report(anchored.node, { token: anchored.token, offset: anchored.offset });
    }
  }
}

function lineOf(text: string, index: number): number {
  return text.slice(0, index).split("\n").length;
}

function cssFiles(root: string): string[] {
  const files: string[] = [];
  for (const cssRoot of CSS_ROOTS) {
    const dir = join(root, cssRoot);
    if (!existsSync(dir)) {
      continue;
    }
    for (const entry of readdirSync(dir, { recursive: true, encoding: "utf8" })) {
      const rel = `${cssRoot}/${entry.replaceAll("\\", "/")}`;
      if (rel.endsWith(".css")) {
        files.push(rel);
      }
    }
  }
  return files.sort((a, b) => a.localeCompare(b));
}

const TRANSFORM_DECL_RE = /(?<property>transform|translate|scale)\s*:\s*(?<value>[^;}]+)/gu;
/** Both at-rules whose blocks are ANIMATING landings, never rest ones: keyframe stops, and the entry/exit
 *  snapshot `@starting-style` takes before a transition runs. */
const ANIMATING_AT_RULE_RE = /@(?:keyframes|starting-style)\b/gu;
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

/** The index of the `}` closing the block that opens at `open`, or the end of the text when unbalanced. */
function blockEnd(text: string, open: number): number {
  let depth = 0;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return text.length;
}

/** Spans of `@keyframes`/`@starting-style` blocks — an animating stop is not a REST landing, so the whole
 *  block is skipped. Brace-counted rather than regex-matched: a keyframe body nests one level of stops. */
function animatingSpans(text: string): readonly (readonly [number, number])[] {
  const spans: [number, number][] = [];
  let match = ANIMATING_AT_RULE_RE.exec(text);
  while (match !== null) {
    const open = text.indexOf("{", match.index);
    if (open !== -1) {
      spans.push([match.index, blockEnd(text, open)]);
    }
    match = ANIMATING_AT_RULE_RE.exec(text);
  }
  return spans;
}

/** The selector prelude of the block a declaration sits in: walk back to the `{` that opens it, then to the
 *  previous statement boundary. Text-level rather than a CSS parse, matching this gate's line-scan posture
 *  (the stylesheet is outside the ts-morph project) and the sibling integer-line-boxes ARM C. */
function enclosingSelector(text: string, index: number): string {
  let depth = 0;
  for (let cursor = index; cursor >= 0; cursor -= 1) {
    const char = text[cursor];
    if (char === "}") {
      depth += 1;
      continue;
    }
    if (char !== "{") {
      continue;
    }
    if (depth > 0) {
      depth -= 1;
      continue;
    }
    let start = cursor - 1;
    while (start >= 0 && text[start] !== "}" && text[start] !== "{" && text[start] !== ";") {
      start -= 1;
    }
    return text.slice(start + 1, cursor).trim();
  }
  return "";
}

interface CssScan {
  readonly ctx: GateRunCtx;
  readonly rel: string;
  readonly text: string;
}

function checkCssTransforms(scan: CssScan): void {
  const spans = animatingSpans(scan.text);
  let decl = TRANSFORM_DECL_RE.exec(scan.text);
  while (decl !== null) {
    const value = (decl.groups?.["value"] ?? "").trim();
    const index = decl.index;
    const animating = spans.some(([start, end]) => index >= start && index <= end);
    const stateKeyed = STATE_SELECTOR_RE.test(enclosingSelector(scan.text, index));
    if (!(animating || stateKeyed) && (FRACTIONAL_PX_RE.test(value) || PERCENTAGE_RE.test(value))) {
      // @finding-overload-ok: a stylesheet line-scan verdict — CSS is outside the ts-morph project, so there is no node to anchor; suppression stays line-adjacent in the stylesheet (#828).
      scan.ctx.report({ file: scan.rel, line: lineOf(scan.text, index), column: 1, token: value });
    }
    decl = TRANSFORM_DECL_RE.exec(scan.text);
  }
}

interface BlindnessInputs {
  readonly roots: number;
  readonly census: TransformCensus;
  readonly stylesheetCount: number;
}

function reportBlindness(ctx: GateRunCtx, inputs: BlindnessInputs): void {
  const blind: string[] = [];
  if (inputs.roots === 0) {
    blind.push("static class-expression derivation returned zero carrier roots");
  }
  if (inputs.census.tokens < MIN_TRANSFORM_TOKENS) {
    blind.push(`transform-utility census below the real-tree floor (${String(inputs.census.tokens)} tokens)`);
  }
  if (inputs.stylesheetCount === 0) {
    blind.push("zero stylesheets read");
  }
  for (const reason of blind) {
    ctx.report({
      file: GATE_SELF,
      line: 1,
      column: 0,
      message: `${reason} — the rest-transform census is blind, not clean (tooling/src/verify/gates/rest-transform-grid.ts)`,
    });
  }
}

export const gate: GateDescriptor = {
  name: "rest-transform-grid",
  docRow: "client-architecture-lockdown.md §4 (docs/design/integer-line-boxes.md §9)",
  status: "active",
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  fsBacked: true,
  scanRoot: (path) => path.startsWith("packages/ui/src/") || path.startsWith("packages/client/src/"),
  run: (ctx) => {
    const files = ctx.files.filter((source) => {
      const path = repoRel(ctx.root, source.getFilePath());
      return path.startsWith("packages/ui/src/") || path.startsWith("packages/client/src/");
    });
    const walked = walkStaticClassExpressions(files);
    const census: TransformCensus = { tokens: 0 };
    for (const candidate of walked.candidates) {
      judgeCandidate({ ctx, census, segments: candidate.segments }, candidate.value);
    }
    for (const unresolved of walked.unresolved) {
      ctx.report(unresolved.node, { token: `unresolved:${unresolved.reason}`, offset: 0 });
    }
    const stylesheets = cssFiles(ctx.root);
    for (const rel of stylesheets) {
      checkCssTransforms({ ctx, rel, text: blankCssComments(readFileSync(join(ctx.root, rel), "utf8")) });
    }
    ctx.scan({
      unit: "transform carrier",
      candidates: walked.candidates.length + walked.unresolved.length + walked.opaque.length + stylesheets.length,
      scanned: walked.candidates.length + stylesheets.length,
      skipped: { unresolved: walked.unresolved.length, "opaque-runtime": walked.opaque.length },
    });
    if (ctx.scope.kind === "project" && fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      reportBlindness(ctx, { roots: walked.roots, census, stylesheetCount: stylesheets.length });
    }
  },
  mustFlag: [
    {
      files: {
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-95 rounded-card" />;\n',
      },
      expect: { token: "scale-95" },
      why: "the founding shape: a resting scale resamples every glyph in the subtree for the whole life of the element — the crispness doctrine's Law 2",
    },
    {
      files: {
        "packages/ui/src/x.tsx": 'export const G = <div className="md:-scale-x-105" />;\n',
      },
      expect: { token: "-scale-x-105" },
      why: "a breakpoint is a viewport fact, not a state — the transform still rests at that width, and the sign/axis spellings must not evade the arm",
    },
    {
      files: {
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-[1.02]" />;\n',
      },
      expect: { token: "scale-[1.02]" },
      why: "an arbitrary rest scale is the unprovable case, and `scale` is absent from no-arbitrary-tw-values' SCOPED_UTILITY_RE — nothing else on the ladder judges it",
    },
    {
      files: {
        "packages/ui/src/tv.ts": 'import { tv } from "tailwind-variants";\nexport const x = tv({ slots: { root: "px-2 scale-90" } });\n',
      },
      expect: { token: "scale-90" },
      why: "tv slot strings are class carriers — the rest law must reach composed variants, not only JSX",
    },
    {
      files: {
        "packages/ui/src/styles/extra.css": ".x {\n  transform: translateX(-0.5px);\n}\n",
      },
      expect: { token: "translateX(-0.5px)" },
      why: "a fractional px rest translate in a stylesheet lands the box between device pixels — the exact arithmetic Law 1 closed one property over",
    },
    {
      files: {
        "packages/ui/src/styles/extra.css": ".x {\n  translate: -50% 0;\n}\n",
      },
      expect: { token: "-50% 0" },
      why: "a percentage rest translate is a fraction of a runtime box — at any odd width it lands off the grid, and the individual `translate` property must not be the hole in a `transform`-only matcher",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/ui/src/x.tsx": 'export const G = <div className="transition-[scale] active:scale-95 group-hover:scale-105 data-active:scale-95" />;\n',
      },
      why: "state-prefixed scales are MOTION, not rest — the live button/press idiom, and the whole reason this gate classifies variants instead of banning the utility",
    },
    {
      files: {
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-100 rotate-45 translate-y-2" />;\n',
      },
      why: "declared limits: identity scale is the escape, and a rest ROTATE (the overlay-arrow diamond) or a token-scale TRANSLATE is judged at resolved-pixel time by ui-audit's off-grid-transform rule, never here",
    },
    {
      files: {
        "packages/ui/src/x.tsx": 'export const G = <div className="before:-translate-x-1/2 after:-translate-y-1/2" />;\n',
      },
      why: "declared limit: a PERCENTAGE translate is a runtime fraction of the element's own box — unprovable from the class string, so the live centring idiom is the runtime rule's subject, not a static finding",
    },
    {
      files: {
        "packages/ui/src/styles/extra.css":
          "@keyframes shimmer {\n  from {\n    transform: translateX(0);\n  }\n  to {\n    transform: translateX(100%);\n  }\n}\n",
      },
      why: "a @keyframes stop is an ANIMATING landing, not a rest one — the live skeleton-shimmer and indeterminate-hairline sweeps both ride 100% stops",
    },
    {
      files: {
        "packages/ui/src/styles/extra.css": ".x {\n  transform: translateX(var(--drawer-swipe-movement-x));\n}\n",
      },
      why: "declared limit: a var()/calc() indirection carries the token's own contract — the resolved landing is ui-audit's off-grid-transform rule",
    },
    {
      files: {
        "packages/ui/src/styles/extra.css":
          '.shell-panel[data-panel-mode="collapsed"] {\n  transform: translateX(-100%);\n}\n@starting-style {\n  .y {\n    translate: -50% 0;\n  }\n}\n',
      },
      why: "the live shell.css shape: a state-KEYED rule is the stylesheet's spelling of a state variant, and @starting-style is an entry snapshot — both are MOTION, the same classification ARM S gives `data-*:` prefixes",
    },
  ],
};
