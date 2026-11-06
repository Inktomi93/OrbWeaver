// Hand-written class tokens: utilities a recipe prop or token already owns, Tailwind arbitrary values, repeated clusters and raw layout containers.
import type { TokenFact } from "./classes.ts";
import { baseOf, classifyToken, classStringsOf } from "./classes.ts";
import { clusterKey, proposeName } from "./classify.ts";
import { coveredJudgement, declaredAxis, uncoveredJudgement } from "./hand-arms.ts";
import type { Hit, Judgement, Place } from "./hand-model.ts";
import { hitOf, judgeLit, keepJudgement } from "./hand-model.ts";
import type { Lit } from "./literals.ts";
import { lit, valueStringLits } from "./literals.ts";
import { CLUSTER_TOKENS, CONTAINER_TAGS } from "./markup.ts";
import { KINDS } from "./sites.ts";
import type { Elem, Source } from "./source.ts";
import type { ValueNamespace, ValueTokens } from "./tokens.ts";
import type { DeclaredVariants } from "./variants.ts";

const CLUSTER_MIN_USES = 3;
const CLUSTER_LABEL_MAX = 80;
const PERCENT = 100;
// Track formulas, transition property lists, generated content and background geometry have no value to price.
const MECHANISM_UTILITY = /^(?:grid-cols|grid-rows|auto-cols|auto-rows|transition|content|bg-position|bg-size|will-change)$/u;
// An arbitrary property that sets a transform or a clip.
const MECHANISM_PROPERTY = /^\[(?:transform|translate|rotate|scale|clip-path|mask[\w-]*):/u;

/** The CSS property a utility prefix writes, so a literal is priced against the right token namespaces. */
const PREFIX_PROPERTY: readonly (readonly [RegExp, string])[] = [
  [/^(?:w|h|size|min-w|min-h|max-w|max-h|inline|block|min-inline|max-inline|min-block|max-block)$/u, "width"],
  [/^(?:p[xytrbsel]?|m[xytrbsel]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|left|right|bottom|start|end)$/u, "padding"],
  [/^rounded(?:-.+)?$/u, "border-radius"],
  [/^text$/u, "font-size"],
  [/^leading$/u, "line-height"],
];

/** Recipe axes that own a class family, by the axis names the doors declare. */
const AXES_BY_KIND: Readonly<Record<string, readonly string[]>> = {
  "tw-radius": ["shape", "rounded", "corners"],
  "tw-shadow": ["elevated", "shadow", "glow"],
  "tw-border": ["edge", "divider"],
  "tw-opacity": ["receded"],
};

interface Family {
  readonly pattern: RegExp;
  /** Token namespaces whose names complete the utility, or none for a utility with no token. */
  readonly spaces: readonly ValueNamespace[];
  readonly axes: readonly string[];
}

// A utility that is valid today and that a recipe prop on a primitive owns. The suffix is checked against the theme's token names.
const OWNED_FAMILIES: readonly Family[] = [
  { pattern: /^(?:gap|gap-x|gap-y|space-x|space-y)-(.+)$/u, spaces: ["spacing"], axes: ["gap"] },
  { pattern: /^p[xytrblse]?-(.+)$/u, spaces: ["spacing"], axes: ["padding"] },
  { pattern: /^items-(.+)$/u, spaces: [], axes: ["align"] },
  { pattern: /^justify-(.+)$/u, spaces: [], axes: ["justify"] },
  { pattern: /^text-(.+)$/u, spaces: ["text"], axes: ["size", "step", "titleStep"] },
  { pattern: /^text-(.+)$/u, spaces: ["color"], axes: ["tone", "ink"] },
  { pattern: /^bg-(.+)$/u, spaces: ["color"], axes: ["tone", "ground", "variant", "fill"] },
  { pattern: /^font-(.+)$/u, spaces: ["font-weight"], axes: ["weight"] },
  { pattern: /^rounded-(.+)$/u, spaces: ["radius"], axes: ["shape", "rounded", "corners"] },
  { pattern: /^shadow-(.+)$/u, spaces: ["shadow"], axes: ["elevated", "shadow", "glow"] },
  { pattern: /^opacity-(.+)$/u, spaces: ["opacity"], axes: ["receded"] },
];
// Utilities with no suffix.
const BARE_AXES: Readonly<Record<string, readonly string[]>> = {
  italic: ["italic"],
  truncate: ["lines"],
  uppercase: ["caps", "voice"],
  "tabular-nums": ["numeric"],
};

export interface ClassContext {
  readonly tokens: ValueTokens;
  readonly declared: DeclaredVariants;
  readonly referenced: ReadonlySet<string>;
}

const placeOf = (source: Source, line: number): Place => ({ path: source.path, line, section: source.section, layer: source.layer });

const namesIn = (tokens: ValueTokens, space: ValueNamespace): ReadonlySet<string> =>
  new Set(tokens.all.filter((token) => token.space === space).map((token) => token.name.slice(`--${space}-`.length)));

function propertyOf(base: string): string | null {
  const prefix = base.includes("-[") ? base.slice(0, base.indexOf("-[")) : base;
  return PREFIX_PROPERTY.find(([pattern]) => pattern.test(prefix))?.[1] ?? null;
}

function arbitraryJudgement(base: string, fact: TokenFact, tokens: ValueTokens): Judgement {
  const property = propertyOf(base);
  const found = valueStringLits((fact.literal ?? "").replaceAll("_", " "), property)[0];
  if (found !== undefined) {
    return judgeLit(found, property, tokens);
  }
  const prefix = base.slice(0, Math.max(base.indexOf("-["), 0));
  return MECHANISM_UTILITY.test(prefix) || MECHANISM_PROPERTY.test(base)
    ? keepJudgement("css-mechanism", base)
    : { verdict: "decide", match: null, owner: `decide: arbitrary ${prefix}`, reason: `${base} is a formula no token or prop prices`, keep: null };
}

function stepJudgement(fact: TokenFact, tokens: ValueTokens): Judgement | null {
  // The `px` step is the theme's own `--spacing-px`, a token utility.
  if (fact.px === null || fact.literal === "px") {
    return null;
  }
  const found: Lit = lit("length", `${fact.px}px`);
  return judgeLit(found, fact.kind === "tw-raw-spacing" ? "padding" : "width", tokens);
}

function colourJudgement(token: string, fact: TokenFact, tokens: ValueTokens): Judgement {
  const found = fact.literal === null ? undefined : valueStringLits(fact.literal.replaceAll("_", " "))[0];
  if (found !== undefined && token.includes("[")) {
    return judgeLit(found, null, tokens);
  }
  return {
    verdict: "token",
    match: null,
    owner: "semantic colour role",
    reason: `${fact.literal ?? token} is not a theme role; a --color-* role or a tone prop owns it`,
    keep: null,
  };
}

/** The verdict for a literal-numbered utility: z, opacity, border and ring widths; `-none` and the 0 and 1 sentinels stay. */
function numericJudgement(token: string, fact: TokenFact, tokens: ValueTokens): Judgement | null {
  const base = fact.literal ?? "";
  if (base.endsWith("-none")) {
    return keepJudgement("zero-sentinel", token);
  }
  const digits = /-(\d+)$/u.exec(base)?.[1];
  const amount = digits === undefined ? null : Number(digits);
  switch (fact.kind) {
    // A bare `border` or `ring` is the default width, one pixel.
    case "tw-border":
      return amount === 0 ? keepJudgement("zero-sentinel", token) : judgeLit(lit("length", `${amount ?? 1}px`), "border-width", tokens);
    case "tw-z":
      return amount === null ? null : zJudgement(token, token.slice(token.lastIndexOf(":") + 1).startsWith("-") ? -amount : amount, tokens);
    case "tw-opacity":
      return amount === null ? null : opacityJudgement(token, amount, tokens);
    default:
      return null;
  }
}

function zJudgement(token: string, amount: number, tokens: ValueTokens): Judgement {
  return Math.abs(amount) <= 1 ? keepJudgement("zero-sentinel", token) : judgeLit(lit("z", String(amount)), "z-index", tokens);
}

function opacityJudgement(token: string, percent: number, tokens: ValueTokens): Judgement {
  return percent === 0 || percent === PERCENT ? keepJudgement("zero-sentinel", token) : judgeLit(lit("opacity", String(percent / PERCENT)), "opacity", tokens);
}

// The intent colours, whose hand-mixed alpha the tone roles replace (D336); a neutral role at alpha has no named step.
const INTENT_COLOUR = /^(?:primary|destructive|warning|success|info)(?:-foreground)?$/u;
const ALPHA_UTILITY = /^(?:bg|text|border|ring|fill|stroke|from|via|to)-(.+)\/\d+$/u;

function alphaJudgement(token: string): Judgement {
  const colour = ALPHA_UTILITY.exec(baseOf(token).base)?.[1] ?? token;
  if (INTENT_COLOUR.test(colour)) {
    return {
      verdict: "token",
      match: null,
      owner: "opaque tone role",
      reason: `${token} mixes an intent colour by hand; a tone role (tint, edge, text-on-tint) owns it (D336)`,
      keep: null,
    };
  }
  return {
    verdict: "decide",
    match: null,
    owner: "decide: alpha on a neutral colour has no named step",
    reason: `${token} mixes alpha into ${colour}; tone roles resolve under a [data-tone] element, and no role names this step`,
    keep: null,
  };
}

const FIXED: Readonly<Record<string, Judgement>> = {
  "tw-important": {
    verdict: "decide",
    match: null,
    owner: "decide: an important modifier needs a variant",
    reason: "an important modifier fights a primitive; no variant owns the need yet",
    keep: null,
  },
  "tw-viewport-variant": {
    verdict: "token",
    match: null,
    owner: "container-query variant",
    reason: "a viewport breakpoint variant is a container-query variant (@cq-*)",
    keep: null,
  },
  "tw-gradient": { verdict: "decide", match: null, owner: "decide: gradient has no owner", reason: "no token or primitive owns gradients", keep: null },
  "tw-clip": { verdict: "decide", match: null, owner: "decide: clip-path has no owner", reason: "no token or primitive owns clip paths", keep: null },
};

/** The verdict for a class token the audit flags; an arm of the element's primitive that writes it wins over a token. */
function flaggedJudgement(token: string, fact: TokenFact, elem: Elem | null, context: ClassContext): Judgement {
  const axis = declaredAxis(elem, AXES_BY_KIND[fact.kind] ?? [], context.declared);
  const covered = axis === null ? null : coveredJudgement(axis, token);
  if (covered !== null) {
    return covered;
  }
  const fixed = FIXED[fact.kind];
  if (fixed !== undefined) {
    return fixed;
  }
  switch (fact.kind) {
    case "tw-alpha":
      return alphaJudgement(token);
    case "tw-arbitrary":
      return arbitraryJudgement(baseOf(token).base, fact, context.tokens);
    case "tw-color-literal":
      return colourJudgement(token, fact, context.tokens);
    case "tw-raw-size":
    case "tw-raw-spacing":
      return stepJudgement(fact, context.tokens) ?? keepJudgement("token-utility", token);
    case "tw-transform":
      return keepJudgement("css-mechanism", token);
    default:
      return numericJudgement(token, fact, context.tokens) ?? ownerJudgement(token, fact);
  }
}

/** A flagged utility with no value to match: the replacement the audit names owns it. */
function ownerJudgement(token: string, fact: TokenFact): Judgement {
  const owner = KINDS[fact.kind]?.replacement ?? fact.kind;
  return { verdict: "token", match: null, owner, reason: `${token} is hand-written; ${owner} owns it`, keep: null };
}

interface Candidate {
  readonly axes: readonly string[];
  /** The utility family the axis's arms write, or null for a utility with no suffix. */
  readonly pattern: RegExp | null;
}

/** A valid token utility on a primitive that declares the family's axis: an arm owns it, a new arm would, or no axis does. */
function ownedJudgement(token: string, elem: Elem | null, context: ClassContext): Judgement | null {
  const base = baseOf(token).base;
  const bare = BARE_AXES[base];
  const candidates: readonly Candidate[] =
    bare === undefined ? OWNED_FAMILIES.filter((family) => ownsSuffix(family, base, context.tokens)) : [{ axes: bare, pattern: null }];
  for (const { axes, pattern } of candidates) {
    const axis = declaredAxis(elem, axes, context.declared);
    if (axis !== null) {
      return coveredJudgement(axis, token) ?? uncoveredJudgement(axis, token, pattern);
    }
  }
  return null;
}

/** The family's pattern matches and its suffix names a token in the family's namespaces. */
function ownsSuffix(family: Family, base: string, tokens: ValueTokens): boolean {
  const suffix = family.pattern.exec(base)?.[1];
  return suffix !== undefined && (family.spaces.length === 0 || family.spaces.some((space) => namesIn(tokens, space).has(suffix)));
}

const LAYOUT_OWNER: readonly (readonly [string, string])[] = [
  ["flex-col", "Stack (@orb/ui/layout)"],
  ["flex", "Row (@orb/ui/layout)"],
  ["inline-flex", "Row (@orb/ui/layout)"],
  ["grid", "Grid (@orb/ui/layout)"],
];

/** The layout primitive a raw container's class tokens rebuild, or Card for a bordered or tinted rounded box. */
function layoutOwner(tokens: readonly string[]): string | null {
  const bases = new Set(tokens.map((token) => baseOf(token).base));
  const layout = LAYOUT_OWNER.find(([name]) => bases.has(name));
  if (layout !== undefined) {
    return layout[1];
  }
  const painted = [...bases].some((base) => /^(?:border|bg-.+|shadow(?:-.+)?)$/u.test(base));
  return painted && [...bases].some((base) => base.startsWith("rounded")) ? "Card (@orb/ui/card)" : null;
}

interface ClusterUse {
  readonly key: string;
  readonly label: string;
  readonly place: Place;
  readonly door: string | null;
}

interface ClassUse {
  readonly source: Source;
  readonly line: number;
  readonly tokens: readonly string[];
  readonly elem: Elem | null;
}

function rawLayoutHit({ source, line, tokens, elem }: ClassUse): Hit | null {
  const owner = elem?.kind === "raw" && source.layer === "client" && CONTAINER_TAGS.has(elem.tag) ? layoutOwner(tokens) : null;
  return owner === null
    ? null
    : hitOf(
        placeOf(source, line),
        { category: "hand-built", where: "class", detail: `<${elem?.tag ?? ""} className>` },
        { verdict: "primitive", match: owner, owner, reason: `a raw container rebuilds ${owner}`, keep: null },
      );
}

function tokenHits({ source, line, tokens, elem }: ClassUse, context: ClassContext): readonly Hit[] {
  const out: Hit[] = [];
  for (const token of tokens) {
    const fact = classifyToken(token);
    const judgement = fact === null ? ownedJudgement(token, elem, context) : flaggedJudgement(token, fact, elem, context);
    if (judgement !== null) {
      out.push(hitOf(placeOf(source, line), { category: "class-utility", where: "class", detail: token }, judgement));
    }
  }
  return out;
}

/** What owns a repeated class set: a shared slot when only the ui package writes it, a variant when one primitive wears it, else a composite. */
function clusterJudgement(group: readonly ClusterUse[]): Judgement {
  const first = group[0];
  const label = first?.label ?? "";
  const name = proposeName(first?.key ?? "");
  const files = new Set(group.map((use) => use.place.path)).size;
  const written = `the same class set is written ${group.length} times in ${files} files`;
  const doors = new Set(group.map((use) => use.door));
  const [onlyDoor] = doors;
  if (group.every((use) => use.place.layer === "ui")) {
    return { verdict: "recipe", match: null, owner: `shared slot: ${label}`, reason: `${written}; one shared slot constant in @orb/ui owns it`, keep: null };
  }
  if (doors.size === 1 && onlyDoor !== null && onlyDoor !== undefined) {
    return { verdict: "recipe", match: null, owner: `variant on ${onlyDoor}: ${label}`, reason: `${written} on ${onlyDoor}; a variant owns it`, keep: null };
  }
  return { verdict: "primitive", match: null, owner: `composite ${name}: ${label}`, reason: `${written}; a composite like ${name} owns it`, keep: null };
}

function clusterHits(uses: readonly ClusterUse[]): readonly Hit[] {
  const groups = new Map<string, ClusterUse[]>();
  for (const use of uses) {
    groups.set(use.key, [...(groups.get(use.key) ?? []), use]);
  }
  return [...groups.values()]
    .filter((group) => group.length >= CLUSTER_MIN_USES)
    .flatMap((group) => {
      const judgement = clusterJudgement(group);
      return group.map((use) => hitOf(use.place, { category: "repeated-cluster", where: "cluster", detail: use.label }, judgement));
    });
}

/** Every class-token, cluster and raw-container hit in the sources; clusters are counted across all of them. */
export function classHits(sources: readonly Source[], context: ClassContext): readonly Hit[] {
  const hits: Hit[] = [];
  const uses: ClusterUse[] = [];
  for (const source of sources) {
    for (const classString of source.sf === null ? [] : classStringsOf(source.path, source.sf, context.referenced)) {
      const use: ClassUse = { source, line: classString.line, tokens: classString.tokens, elem: classString.elem };
      const layout = rawLayoutHit(use);
      hits.push(...tokenHits(use, context), ...(layout === null ? [] : [layout]));
      if (use.tokens.length >= CLUSTER_TOKENS) {
        const key = clusterKey(use.tokens.join(" "));
        uses.push({ key, label: key.slice(0, CLUSTER_LABEL_MAX), place: placeOf(source, use.line), door: use.elem?.door ?? null });
      }
    }
  }
  return [...hits, ...clusterHits(uses)];
}
