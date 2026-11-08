// Hand-written class tokens: utilities a recipe prop or token already owns, Tailwind arbitrary values, repeated clusters and raw layout containers.

import type { ClassConstants, ComponentTables, Elem, Hit, Judgement, Lit, Place, Source, TokenFact, ValueTokens, Wearer } from "../eslint/index.ts";
import {
  ALPHA_UTILITY,
  baseOf,
  classifyToken,
  classStringsOf,
  coveredJudgement,
  elementRefOf,
  GRADIENT_OWNER,
  hitOf,
  IMPORTANT_OWNER,
  judgeLit,
  kebab,
  keepJudgement,
  lit,
  ownerRow,
  valueStringLits,
  wearerOf,
  writingAxis,
} from "../eslint/index.ts";
import type { ForwardReader } from "./class-forwards.ts";
import { clusterKey, proposeName } from "./classify.ts";
import { CLUSTER_TOKENS, CONTAINER_TAGS } from "./markup.ts";
import { KINDS } from "./sites.ts";

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

// The step every bare `border`, `border-s`, `divide-*` and `ring` compiles to, when the theme declares it.
const DEFAULT_EDGE_TOKEN = "--border-width-default";

export interface ClassContext {
  readonly tokens: ValueTokens;
  readonly components: ComponentTables;
  readonly referenced: ClassConstants;
  readonly forwards: ForwardReader;
}

const placeOf = (source: Source, line: number): Place => ({ path: source.path, line, section: source.section, layer: source.layer });

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
    case "tw-border":
      return borderJudgement(token, amount, tokens);
    case "tw-z":
      return amount === null ? null : zJudgement(token, token.slice(token.lastIndexOf(":") + 1).startsWith("-") ? -amount : amount, tokens);
    case "tw-opacity":
      return amount === null ? null : opacityJudgement(token, amount, tokens);
    default:
      return null;
  }
}

/** A bare edge reads the theme's default step when there is one, so there is nothing to move; with none it is the stock one pixel. */
function borderJudgement(token: string, amount: number | null, tokens: ValueTokens): Judgement {
  if (amount === 0 || (amount === null && tokens.all.some((held) => held.name === DEFAULT_EDGE_TOKEN))) {
    return keepJudgement(amount === 0 ? "zero-sentinel" : "token-utility", token);
  }
  return judgeLit(lit("length", `${amount ?? 1}px`), "border-width", tokens);
}

function zJudgement(token: string, amount: number, tokens: ValueTokens): Judgement {
  return Math.abs(amount) <= 1 ? keepJudgement("zero-sentinel", token) : judgeLit(lit("z", String(amount)), "z-index", tokens);
}

function opacityJudgement(token: string, percent: number, tokens: ValueTokens): Judgement {
  return percent === 0 || percent === PERCENT ? keepJudgement("zero-sentinel", token) : judgeLit(lit("opacity", String(percent / PERCENT)), "opacity", tokens);
}

// The intent colours, whose hand-mixed alpha the tone roles replace (D336); a neutral role at alpha has no named step.
const INTENT_COLOUR = /^(?:primary|destructive|warning|success|info)(?:-foreground)?$/u;

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
    owner: IMPORTANT_OWNER,
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
  "tw-gradient": { verdict: "decide", match: null, owner: GRADIENT_OWNER, reason: "no token or primitive owns gradients", keep: null },
  "tw-clip": { verdict: "decide", match: null, owner: "decide: clip-path has no owner", reason: "no token or primitive owns clip paths", keep: null },
};

/** The verdict for a class token the audit flags; an arm of the element's primitive that writes it wins over a token. */
function flaggedJudgement({ token, elem, guarded, siblings }: UsedToken, fact: TokenFact, context: ClassContext): Judgement {
  const axis = writingAxis(wearerOf(elem), token, siblings, context.components);
  if (axis !== null) {
    return coveredJudgement(axis, token, guarded, siblings);
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

/** A class token as one element writes it, and whether a ternary or `&&` guards it. */
interface UsedToken {
  readonly token: string;
  readonly elem: Elem | null;
  readonly guarded: boolean;
  /** Every other class the same root writes. */
  readonly siblings: readonly string[];
}

/** A valid utility on a primitive: an arm of its own table writes it, its door's tables name an owner, or the tables show it has no home here. */
function wornJudgement(wearer: Wearer | null, { token, guarded, siblings }: UsedToken, context: ClassContext): Judgement | null {
  const axis = writingAxis(wearer, token, siblings, context.components);
  return axis === null ? ownerRow(wearer, { token, guarded, siblings }, context.components) : coveredJudgement(axis, token, guarded, siblings);
}

/** A class written on a client component that hands its `className` on: judged on the primitive it lands on, and no move is proved through the wrapper. */
function forwardedJudgement(used: UsedToken, path: string, context: ClassContext): Judgement | null {
  const landed = used.elem === null ? [] : context.forwards(path, used.elem);
  const found = landed.flatMap((landing) => {
    const judgement = wornJudgement(landing, used, context);
    return judgement === null || judgement.verdict === "keep" ? [] : [{ wearer: landing, judgement }];
  })[0];
  if (found === undefined) {
    return null;
  }
  const { wearer, judgement } = found;
  const component = kebab(used.elem?.imported?.name ?? used.elem?.tag ?? "");
  return {
    verdict: "decide",
    match: null,
    owner: `through ${component}: ${judgement.owner}`,
    reason: `${component} hands its className to ${wearer.component}, where ${judgement.reason}`,
    keep: null,
  };
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
  /** The element that wears the class set; null for a constant no element is known to wear. */
  readonly elem: Elem | null;
}

interface ClassUse {
  readonly source: Source;
  readonly line: number;
  readonly tokens: readonly string[];
  readonly elem: Elem | null;
  readonly guarded: boolean;
  readonly plain: boolean;
  readonly rootTokens: readonly string[];
  readonly opaque: string | null;
  readonly column: number;
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

function usedJudgement(used: UsedToken, path: string, context: ClassContext): Judgement | null {
  const fact = classifyToken(used.token);
  if (fact !== null) {
    return flaggedJudgement(used, fact, context);
  }
  return wearerOf(used.elem) === null ? forwardedJudgement(used, path, context) : wornJudgement(wearerOf(used.elem), used, context);
}

function tokenHits({ source, line, column, tokens, elem, guarded, plain, rootTokens, opaque }: ClassUse, context: ClassContext): readonly Hit[] {
  const out: Hit[] = [];
  for (const token of tokens) {
    const peers = rootTokens.filter((written) => written !== token);
    const used: UsedToken = { token, elem, guarded, siblings: peers };
    const judgement = usedJudgement(used, source.path, context);
    if (judgement !== null) {
      const element = elementRefOf(elem, { plain, peers, opaque, column });
      out.push(hitOf(placeOf(source, line), { category: "class-utility", where: "class", detail: token }, judgement, element));
    }
  }
  return out;
}

/** A layout box a composite such as PlainBox can replace: a raw container, or a layout primitive. */
const isBox = ({ elem }: ClusterUse): boolean =>
  elem !== null && ((elem.kind === "raw" && CONTAINER_TAGS.has(elem.tag)) || (elem.kind === "ui" && elem.door === "layout"));

/** The group's uses as a whole: a shared slot when only the ui package writes the set, a variant when one primitive door wears it, else null. */
function wholeJudgement(share: readonly ClusterUse[], label: string, written: string): Judgement | null {
  const doors = new Set(share.map((use) => use.door));
  const [onlyDoor] = doors;
  if (share.every((use) => use.place.layer === "ui")) {
    return { verdict: "recipe", match: null, owner: `shared slot: ${label}`, reason: `${written}; one shared slot constant in @orb/ui owns it`, keep: null };
  }
  if (doors.size === 1 && onlyDoor !== null && onlyDoor !== undefined) {
    return { verdict: "recipe", match: null, owner: `variant on ${onlyDoor}: ${label}`, reason: `${written} on ${onlyDoor}; a variant owns it`, keep: null };
  }
  return null;
}

/** What a part of the group that wears the class set on one kind of element owns: a composite only for layout boxes, else a decision that names the element. */
function partJudgement(part: readonly ClusterUse[], share: readonly ClusterUse[]): Judgement {
  const first = part[0];
  const label = first?.label ?? "";
  const name = proposeName(first?.key ?? "");
  const files = new Set(share.map((use) => use.place.path)).size;
  const written = `the same class set is written ${share.length} times in ${files} files`;
  const whole = wholeJudgement(share, label, written);
  if (whole !== null) {
    return whole;
  }
  if (part.every(isBox) && part.length >= CLUSTER_MIN_USES) {
    return {
      verdict: "primitive",
      match: null,
      owner: `composite ${name}: ${label}`,
      reason: `${written}, ${part.length} of them on layout boxes; a composite like ${name} owns those`,
      keep: null,
    };
  }
  const constant = part.every((use) => use.elem === null);
  const where = constant ? "a class constant" : [...new Set(part.map((use) => use.elem?.tag ?? ""))].join(", ");
  const unfit = constant
    ? `${where} names no element, so a composite like ${name} cannot be shown to fit`
    : `${where} is not a layout box, so a composite like ${name} cannot replace it`;
  const why = part.every(isBox) ? `only ${part.length} of the ${share.length} uses are on layout boxes, too few for a composite like ${name}` : unfit;
  return { verdict: "decide", match: null, owner: `decide: ${label} on ${where}, no composite fits`, reason: `${written}; ${why}`, keep: null };
}

/** Each class set written enough times, judged once per kind of element that wears it, so a layout composite is never offered to a Text or a Badge. */
function clusterHits(uses: readonly ClusterUse[]): readonly Hit[] {
  const groups = new Map<string, ClusterUse[]>();
  for (const use of uses) {
    groups.set(use.key, [...(groups.get(use.key) ?? []), use]);
  }
  return [...groups.values()]
    .filter((group) => group.length >= CLUSTER_MIN_USES)
    .flatMap((group) =>
      [group.filter(isBox), group.filter((use) => use.elem !== null && !isBox(use)), group.filter((use) => use.elem === null)]
        .filter((part) => part.length > 0)
        .flatMap((part) => {
          const judgement = partJudgement(part, group);
          return part.map((use) => hitOf(use.place, { category: "repeated-cluster", where: "cluster", detail: use.label }, judgement));
        }),
    );
}

/** Class uses on one primitive that earned no row: what the census does not cover, so it can say so. */
export interface NoRowUse {
  readonly token: string;
  readonly component: string;
  readonly section: string;
  readonly uses: number;
}

function noRowCount(use: ClassUse, rows: readonly Hit[], into: Map<string, NoRowUse>): void {
  const wearer = wearerOf(use.elem);
  if (wearer === null || use.source.layer !== "client") {
    return;
  }
  const written = new Set(rows.map((hit) => hit.detail));
  for (const token of use.tokens.filter((one) => !written.has(one))) {
    const { section } = use.source;
    const key = `${section} ${wearer.component} ${token}`;
    into.set(key, { token, component: wearer.component, section, uses: (into.get(key)?.uses ?? 0) + 1 });
  }
}

/** A class on a client component whose `className` the forward reader cannot follow to any primitive, so no class on it is judged where it lands. */
export interface UnfollowedUse {
  readonly at: string;
  readonly component: string;
  readonly section: string;
  readonly tokens: readonly string[];
}

function unfollowedOf(use: ClassUse, context: ClassContext): readonly UnfollowedUse[] {
  const { elem, source } = use;
  const wrapper = elem !== null && (elem.kind === "local" || elem.kind === "composite") && source.layer === "client";
  if (!wrapper || use.tokens.length === 0 || context.forwards(source.path, elem).length > 0) {
    return [];
  }
  return [{ at: `${source.path}:${use.line}`, component: elem.imported?.name ?? elem.tag, section: source.section, tokens: use.tokens }];
}

export interface ClassFindings {
  readonly hits: readonly Hit[];
  readonly noRow: readonly NoRowUse[];
  readonly unfollowed: readonly UnfollowedUse[];
}

/** Every class-token, cluster and raw-container hit in the sources, the class uses no row covers, and the wrapper uses the reader cannot follow; clusters are counted across all of them. */
export function classHits(sources: readonly Source[], context: ClassContext): ClassFindings {
  const hits: Hit[] = [];
  const noRow = new Map<string, NoRowUse>();
  const unfollowed: UnfollowedUse[] = [];
  const uses: ClusterUse[] = [];
  const clustered = new Set<string>();
  for (const source of sources) {
    for (const classString of source.sf === null ? [] : classStringsOf(source.path, source.sf, context.referenced)) {
      const use: ClassUse = { ...classString, source, guarded: classString.conditional };
      const layout = rawLayoutHit(use);
      const rows = tokenHits(use, context);
      noRowCount(use, rows, noRow);
      unfollowed.push(...unfollowedOf(use, context));
      hits.push(...rows, ...(layout === null ? [] : [layout]));
      // One string worn by several elements is one write: a repeat is the class set written again.
      const written = `${source.path}:${use.line}:${use.column}`;
      if (use.tokens.length >= CLUSTER_TOKENS && !clustered.has(written)) {
        clustered.add(written);
        const key = clusterKey(use.tokens.join(" "));
        uses.push({ key, label: key.slice(0, CLUSTER_LABEL_MAX), place: placeOf(source, use.line), door: use.elem?.door ?? null, elem: use.elem });
      }
    }
  }
  return { hits: [...hits, ...clusterHits(uses)], noRow: [...noRow.values()], unfollowed };
}
