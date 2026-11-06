// The hand-rolling census vocabulary: one hit per hand-written thing, the verdict it earns and the owner that would retire it.
import { generalTokens, scopeOf } from "./hand-scope.ts";
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
} as const;
export type KeepCode = keyof typeof KEEP_REASONS;

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
  if (found.kind === "gradient") {
    return {
      verdict: "decide",
      match: null,
      owner: "decide: gradient has no owner",
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
    return {
      verdict: "decide",
      match: null,
      owner: `decide: ${kind} ${found.canon}, only a purpose token holds it`,
      reason: `${scoped} holds ${found.text} but is scoped to ${scopeOf(scoped) ?? "one purpose"}; a site with another purpose needs its own step`,
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

export const hitOf = (place: Place, written: Written, judgement: Judgement): Hit => ({ ...written, ...place, ...judgement });

/** The hit order every report uses: path, line, category, detail. */
export const byPlace = (left: Hit, right: Hit): number =>
  left.path.localeCompare(right.path) || left.line - right.line || left.category.localeCompare(right.category) || left.detail.localeCompare(right.detail);
