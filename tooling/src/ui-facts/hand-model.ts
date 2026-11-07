// The hand-rolling census vocabulary: one hit per hand-written thing, the verdict it earns and the owner that would retire it.
import { generalTokens } from "./hand-scope.ts";
import type { Lit, ValueKind } from "./literals.ts";
import type { Layer } from "./source.ts";
import type { ValueNamespace, ValueTokens } from "./tokens.ts";
import { nearestToken, tokensHolding } from "./tokens.ts";

/** The `--only` name that prints the census alone, with every hit. */
export const HAND_ROLLING_PART = "hand-rolling";

export const CATEGORIES = ["token-literal", "raw-value", "class-utility", "inline-style", "repeated-cluster", "hand-built", "repeated-constant"] as const;
export type Category = (typeof CATEGORIES)[number];

/** `token` and `recipe` and `primitive` name the move; `decide` has no owner yet; `keep` is legal as written. */
export const VERDICTS = ["token", "recipe", "primitive", "decide", "keep"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** Where the hand-written thing sits, so a reader can tell a sheet literal from a class token. */
const WHERES = ["sheet", "query", "string", "constant", "timer", "class", "style", "element", "cluster"] as const;
type Where = (typeof WHERES)[number];

export const KEEP_REASONS = {
  "zero-sentinel": "zero, one or none as a state or stacking sentinel, legal in every home (client-architecture-lockdown.md 4.4)",
  "relative-unit": "a viewport, container, font-relative or percentage unit is layout structure, legal in the shell (client-architecture-lockdown.md 4.4)",
  "angle-or-fraction": "an angle is geometry; no token family prices it",
  "derived-colour": "a colour derived from a token (relative colour or mix) is composition, legal per site (client-architecture-lockdown.md 4.4)",
  "css-mechanism": "a transform, clip, mask or track formula is the CSS mechanism itself; no token family prices it",
  "runtime-value": "a runtime value or measurement, not a design value (ui-and-client.md: a style prop holds a runtime value only)",
  "token-utility": "a utility the theme already spells with a token, such as the px step",
  "motion-floor": "a duration under a millisecond is the reduced-motion floor: the shortest value that still fires transition events",
  "feature-probe": "an @supports test names a property and a value to ask the browser, not to paint",
  sentinel: "a value chosen to be told apart from every real one, to detect a rejected assignment; no token family prices it",
  "query-condition":
    "a container query condition cannot read a custom property and no generated variant spells it; query conditions are structural literals (client-architecture-lockdown.md 4.4)",
  "single-constant": "one timing or measurement constant with no repeat and no token that holds it; it is a runtime threshold",
  "keyframe-waypoint": "a keyframe waypoint is an animation value, not a meaning, so it stays a literal (the opacity group in tokens.json)",
  "one-sided-clearance": "padding on one inline edge clears a neighbouring mark; a recipe owns both edges, and no axis names a side",
  "coincident-number": "constants that share a number and name different things; each stays with its own meaning",
  "dom-api-literal": "a literal a DOM API takes in a fixed grammar (a colour input's `#rrggbb` value) cannot be a custom property",
  "svg-geometry": "an SVG radius or centre is in user units of the drawing, not a length the spacing or size scales price",
  "vendor-override":
    "an important modifier inside `@orb/ui` beats a vendor library's inline style, which no variant can out-rank; the suppression at the site states the part",
  "dev-seed-data": "a value the dev seed writes into the app's own records is authored sample data, not paint the client draws",
  "owned-gradient":
    "a gradient the ui layer spells sits in the recipe arm or primitive rule that owns that look, with its stops drawn from tokens; only a gradient written outside ui is unowned",
} as const;
export type KeepCode = keyof typeof KEEP_REASONS;

/** Where a class sits in its `className`, so a plan can prove what moving it would change. */
export interface ClassPlace {
  /** The string is a plain literal, the one node the rewrite edits; a template piece is not. */
  readonly plain: boolean;
  /** Every other class the attribute writes, whatever guards it. */
  readonly peers: readonly string[];
  /** The expression beside this class the reader could not open: it can carry any class, so nothing about the move is proved. */
  readonly opaque: string | null;
  /** The column of the string that holds the class: with the line, the site's identity. */
  readonly column: number;
}

/** The primitive a class hit is written on, as its import names it: what a rewrite must prove before it moves the class. */
export interface ElementRef {
  readonly source: string;
  readonly name: string;
  /** The class is written on a carrier that renders this component, not on the component itself. */
  readonly carried: boolean;
  readonly place: ClassPlace;
  /** The element's other attributes: the value as written, or null for a value the syntax cannot read. */
  readonly props: Readonly<Record<string, string | null>>;
}

export interface Hit {
  readonly category: Category;
  readonly path: string;
  readonly line: number;
  readonly section: string;
  readonly layer: Layer;
  readonly where: Where;
  /** What was written. */
  readonly detail: string;
  readonly verdict: Verdict;
  /** The token, recipe prop or primitive that owns it today; null when none does. */
  readonly match: string | null;
  /** The group the hit retires under: the matching owner, the new token it asks for, or the keep reason. */
  readonly owner: string;
  readonly reason: string;
  readonly keep: KeepCode | null;
  /** The `@orb/ui` component a class utility is written on; null for every other hit. */
  readonly element: ElementRef | null;
}

export interface Place {
  readonly path: string;
  readonly line: number;
  readonly section: string;
  readonly layer: Layer;
}

export type Judgement = Pick<Hit, "verdict" | "match" | "owner" | "reason" | "keep">;

export const keepJudgement = (code: KeepCode, detail?: string): Judgement => ({
  verdict: "keep",
  match: null,
  owner: `keep: ${code}`,
  reason: detail === undefined ? KEEP_REASONS[code] : `${detail}: ${KEEP_REASONS[code]}`,
  keep: code,
});

/** A property written in a stylesheet or a style prop, or the placeholder for a media or container condition. */
export const QUERY_PROPERTY = "@query";

/** The placeholder for a container condition. */
export const CONTAINER_PROPERTY = "@container";

/** The placeholder for a declaration inside an `@supports` test. */
export const SUPPORTS_PROPERTY = "@supports";

/** The placeholder for an `opacity` inside a `@keyframes` block. */
export const KEYFRAME_PROPERTY = "@keyframes";

const ALL_LENGTH_SPACES: readonly ValueNamespace[] = [
  "spacing",
  "size",
  "radius",
  "width",
  "height",
  "dimension",
  "border-width",
  "stroke-width",
  "text",
  "leading",
  "blur",
];

const LENGTH_SPACES: readonly (readonly [RegExp, readonly ValueNamespace[]])[] = [
  [/^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|scroll-padding|scroll-margin)(?:-.+)?$/u, ["spacing", "size", "dimension"]],
  [/^(?:min-|max-)?(?:width|height|inline-size|block-size)$|^flex-basis$|^size$/u, ["size", "width", "height", "dimension", "spacing"]],
  [/radius$/u, ["radius"]],
  [/^(?:border(?:-.+)?-width|outline-width|outline-offset)$/u, ["border-width", "dimension"]],
  [/^font-size$/u, ["text"]],
  [/^line-height$/u, ["leading"]],
  [/^stroke-width$/u, ["stroke-width"]],
  [/^(?:backdrop-)?filter$/u, ["blur"]],
  [new RegExp(`^${QUERY_PROPERTY}$`, "u"), ["breakpoint", "width", "dimension"]],
];

const FIXED_SPACES: Readonly<Partial<Record<ValueKind, readonly ValueNamespace[]>>> = {
  measure: ["reading", "width"],
  duration: ["motion"],
  opacity: ["opacity"],
  z: ["z"],
  weight: ["font-weight"],
  shadow: ["shadow", "text-shadow"],
  colour: ["color"],
  easing: ["ease"],
};

/** The namespaces a literal of this kind, written for this property, could be a token from; narrowest first. */
function spacesFor(kind: ValueKind, property: string | null): readonly ValueNamespace[] {
  if (kind !== "length") {
    return FIXED_SPACES[kind] ?? [];
  }
  const name = property?.toLowerCase() ?? "";
  return LENGTH_SPACES.find(([pattern]) => pattern.test(name))?.[1] ?? ALL_LENGTH_SPACES;
}

const STRUCTURAL_KEEP: Readonly<Record<string, KeepCode>> = {
  zero: "zero-sentinel",
  relative: "relative-unit",
  angle: "angle-or-fraction",
  derived: "derived-colour",
  mechanism: "css-mechanism",
  floor: "motion-floor",
};

const MATCHES_SHOWN = 2;

// The properties that place or size an SVG shape in the drawing's own user units.
const SVG_GEOMETRY: ReadonlySet<string> = new Set(["r", "rx", "ry", "cx", "cy"]);

/** The owner a gradient literal or class gets before the layer it sits in is known. */
export const GRADIENT_OWNER = "decide: gradient has no owner";

/** The owner an important modifier gets before the layer it sits in is known. */
export const IMPORTANT_OWNER = "decide: an important modifier needs a variant";

const DEV_SEED_PATH = "packages/client/src/dev/";

/** What the place the hit sits in settles: ui spells its own gradients and vendor overrides, and the dev seed writes sample data. */
function placedJudgement(place: Place, written: Written, judgement: Judgement): Judgement {
  if (place.layer === "ui" && judgement.owner === GRADIENT_OWNER) {
    return keepJudgement("owned-gradient", written.detail);
  }
  if (place.layer === "ui" && judgement.owner === IMPORTANT_OWNER) {
    return keepJudgement("vendor-override", written.detail);
  }
  return place.path.startsWith(DEV_SEED_PATH) && judgement.verdict !== "keep" ? keepJudgement("dev-seed-data", written.detail) : judgement;
}

/** The verdict for one literal: a token that holds it, a token that should, or a structural value that stays. */
export function judgeLit(found: Lit, property: string | null, tokens: ValueTokens): Judgement {
  if (property === CONTAINER_PROPERTY) {
    return keepJudgement("query-condition", found.text);
  }
  if (property === SUPPORTS_PROPERTY) {
    return keepJudgement("feature-probe", found.text);
  }
  const code = STRUCTURAL_KEEP[found.kind];
  if (code !== undefined) {
    return keepJudgement(code, found.text);
  }
  if (property === KEYFRAME_PROPERTY) {
    return keepJudgement("keyframe-waypoint", found.text);
  }
  if (property !== null && SVG_GEOMETRY.has(property.toLowerCase())) {
    return keepJudgement("svg-geometry", found.text);
  }
  if (found.kind === "gradient") {
    return {
      verdict: "decide",
      match: null,
      owner: GRADIENT_OWNER,
      reason: `${found.text} has no token or primitive that owns gradients`,
      keep: null,
    };
  }
  const kind = found.kind as ValueKind;
  const spaces = spacesFor(kind, property);
  const general = generalTokens(tokens);
  const names = tokensHolding(general, found, spaces);
  const first = names[0];
  if (first !== undefined) {
    return { verdict: "token", match: names.slice(0, MATCHES_SHOWN).join(" or "), owner: first, reason: `${first} holds ${found.text}`, keep: null };
  }
  const scoped = tokensHolding(tokens, found, spaces)[0];
  if (scoped !== undefined) {
    const purpose = tokens.all.find((token) => token.name === scoped)?.scope;
    return {
      verdict: "decide",
      match: null,
      owner: `decide: ${kind} ${found.canon}, only a purpose token holds it`,
      reason: `${scoped} holds ${found.text} but is scoped to ${purpose ?? "one purpose"}; a site with another purpose needs its own step`,
      keep: null,
    };
  }
  const near = nearestToken(general, found, spaces);
  return {
    verdict: "token",
    match: null,
    owner: `new token: ${kind} ${found.canon}`,
    reason: near === null ? `no token holds ${found.text}` : `no token holds ${found.text}; nearest is ${near.name} at ${near.lit.canon}`,
    keep: null,
  };
}

export interface Written {
  readonly category: Category;
  readonly where: Where;
  readonly detail: string;
}

export const hitOf = (place: Place, written: Written, judgement: Judgement, element: ElementRef | null = null): Hit => ({
  ...written,
  ...place,
  ...placedJudgement(place, written, judgement),
  element,
});

/** The hit order every report uses: path, line, category, detail. */
export const byPlace = (left: Hit, right: Hit): number =>
  left.path.localeCompare(right.path) || left.line - right.line || left.category.localeCompare(right.category) || left.detail.localeCompare(right.detail);
