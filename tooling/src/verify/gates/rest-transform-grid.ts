// Semantic class-scale rest-state constraints; native Stylelint owns stylesheet transform declarations.
// Composed/aliased classes, unresolved findings and the complete transform census stay on staticClassFact.
import type { Node } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { StaticClassSegment } from "../lib/static-class-expression.ts";
import { staticClassFact } from "../lib/static-class-facts.ts";

const MESSAGE =
  "A REST-state transform that cannot land on the device-pixel grid — a resting scale resamples the whole " +
  "subtree's raster permanently, and a fractional/percentage rest translate lands the box between device " +
  "pixels, which is the measured config-panel blur one property over. Transforms belong to MOTION (a state " +
  "variant or a @keyframes stop), never to rest; see docs/law/integer-line-boxes.md §9 (Law 2).";
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

const SUPPORTS_VARIANT_RE = /^(?:supports|min|max)-/u;

// Container-query prefixes describe a viewport, not interactive state.
function isRestVariant(prefix: string): boolean {
  return REST_VARIANTS.has(prefix) || prefix.startsWith("@") || SUPPORTS_VARIANT_RE.test(prefix);
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

interface BlindnessInputs {
  readonly roots: number;
  readonly census: TransformCensus;
}

/** ARM B requires its real-tree anchor; a bounded proof is small by construction, not blind. */
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

// Every native class proof has an admitted source; individual rows add their own class carrier.
const CORPUS = {
  "packages/ui/src/keep.tsx": "export const Keep = () => null;\n",
} as const;

export const gate = defineGate({
  id: "rest-transform-grid",
  family: "static-class-expression",
  authority: "hard",
  severity: "error",
  population: { in: ["@client", "@ui"] },
  analysis: "types",
  execution: "entire-population",
  facts: [staticClassFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const walked = ctx.fact(staticClassFact);
      ctx.receipt({ kind: "population", source: staticClassFact.id, members: ctx.files.length });
      const census: TransformCensus = { tokens: 0 };
      for (const candidate of walked.candidates) {
        judgeCandidate({ ctx, census, segments: candidate.segments }, candidate.value);
      }
      for (const unresolved of walked.classUnresolved) {
        ctx.report.node(unresolved.node, { message: `${MESSAGE} (class expression unresolved: ${unresolved.reason})` });
      }
      if (ctx.files.some((source) => ctx.relativePath(source) === REAL_TREE_ANCHOR)) {
        reportBlindness(ctx, { roots: walked.roots, census });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-95 rounded-card" />;\n',
      },
      expect: { count: 1, token: "scale-95" },
      why: "the founding shape: a resting scale resamples every glyph in the subtree for the whole life of the element — the crispness doctrine's Law 2",
    },
    {
      mode: "types",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="md:-scale-x-105" />;\n',
      },
      expect: { count: 1, token: "-scale-x-105" },
      why: "a breakpoint is a viewport fact, not a state — the transform still rests at that width, and the sign/axis spellings must not evade the arm",
    },
    {
      mode: "types",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-[1.02]" />;\n',
      },
      expect: { count: 1, token: "scale-[1.02]" },
      why: "an arbitrary rest scale is the unprovable case, and `scale` is outside the native orb/no-arbitrary-tw-values utility vocabulary — nothing else on the ladder judges it",
    },
    {
      mode: "types",
      files: {
        ...CORPUS,
        "packages/ui/src/tv.ts": 'import { tv } from "tailwind-variants";\nexport const x = tv({ slots: { root: "px-2 scale-90" } });\n',
      },
      expect: { count: 1, token: "scale-90" },
      why: "tv slot strings are class carriers — the rest law must reach composed variants, not only JSX. This is the row the FAMILY rests on: nothing but `walkStaticClassExpressions` sees a class string that never appears in a className attribute",
    },
    {
      mode: "types",
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
      mode: "types",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="transition-[scale] active:scale-95 group-hover:scale-105 data-active:scale-95" />;\n',
      },
      why: "state-prefixed scales are MOTION, not rest — the live button/press idiom, and the whole reason this gate classifies variants instead of banning the utility",
    },
    {
      mode: "types",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-100 rotate-45 translate-y-2" />;\n',
      },
      why: "declared limits: identity scale is the escape, and a rest ROTATE (the overlay-arrow diamond) or a token-scale TRANSLATE is judged at resolved-pixel time by ui-audit's off-grid-transform rule, never here",
    },
    {
      mode: "types",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="before:-translate-x-1/2 after:-translate-y-1/2" />;\n',
      },
      why: "declared limit: a PERCENTAGE translate is a runtime fraction of the element's own box — unprovable from the class string, so the live centring idiom is the runtime rule's subject, not a static finding",
    },
    {
      mode: "types",
      files: {
        ...CORPUS,
        "packages/ui/src/x.tsx": 'export const G = <div className="scale-100" />;\n',
      },
      why: "NARROWING ROW for the ARM B real-tree GUARD: the census here is 1 transform token, far below the floor of 8, and the walk found one root — so cutting the `REAL_TREE_ANCHOR` guard turns this silent row into a blindness finding on every fixture in the corpus. The guard is what stops a whole-tree claim being made over a file map that is small by construction",
    },
  ],
});
