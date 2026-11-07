// The theme's value tokens, each as the literal it holds, so a literal can be answered "a token already holds this" or "none does".
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CssNode, FunctionNode } from "@eslint/css-tree";
import { parse, walk } from "@eslint/css-tree";
import type { Lit } from "./literals.ts";
import { lit, litsOf, normalised, parseValue, VALUE_KINDS } from "./literals.ts";
import { loadPurposes } from "./purposes.ts";

const THEME = "packages/ui/src/styles/theme.css";
const ROOT_PX = 16;
const TAILWIND_STEP_PX = 4;
const NAMESPACES = ["spacing", "size", "radius", "width", "border-width"] as const;
export type TokenNamespace = (typeof NAMESPACES)[number];

export interface LengthTokens {
  /** Pixel value to the custom properties that hold it, per namespace. */
  readonly byPx: ReadonlyMap<number, readonly string[]>;
}

/** The first px or rem length in a token value, in pixels; `round(up, 0.25rem, 1px)` reads as its first argument. */
export function pxOf(value: string): number | null {
  const match = /(?<![\d.])(-?\d*\.?\d+)\s*(px|rem|em)\b/u.exec(value);
  if (match?.[1] === undefined) {
    return null;
  }
  const amount = Number(match[1]);
  return match[2] === "px" ? amount : amount * ROOT_PX;
}

/** The value tokens that are positive pixel lengths in the length namespaces, indexed by pixel value. */
export function lengthTokensOf(values: ValueTokens): LengthTokens {
  const byPx = new Map<number, string[]>();
  for (const token of values.all) {
    const px = Number.parseFloat(token.lit.canon);
    if (token.lit.kind === "length" && (NAMESPACES as readonly string[]).includes(token.space) && px > 0) {
      byPx.set(px, [...(byPx.get(px) ?? []), token.name]);
    }
  }
  return { byPx };
}

/** The tokens that hold a pixel value, optionally narrowed to the namespaces a property can read. */
export function tokensFor(tokens: LengthTokens, px: number, namespaces?: readonly TokenNamespace[]): readonly string[] {
  const found = tokens.byPx.get(px) ?? [];
  return namespaces === undefined ? found : found.filter((name) => namespaces.some((space) => name.startsWith(`--${space}-`)));
}

/** Token namespaces, longest names first so `border-width-*` is not read as `border-*`. */
const VALUE_NAMESPACES = [
  "border-width",
  "stroke-width",
  "font-weight",
  "text-shadow",
  "spacing",
  "size",
  "radius",
  "width",
  "height",
  "container",
  "dimension",
  "breakpoint",
  "text",
  "leading",
  "reading",
  "blur",
  "motion",
  "opacity",
  "z",
  "shadow",
  "color",
  "ease",
] as const;
export type ValueNamespace = (typeof VALUE_NAMESPACES)[number];

/** The property a namespace's values are written for, so the shared literal reader prices them the same way a stylesheet is priced. */
const NAMESPACE_PROPERTY: Readonly<Partial<Record<ValueNamespace, string>>> = {
  opacity: "opacity",
  z: "z-index",
  "font-weight": "font-weight",
  motion: "transition-duration",
  shadow: "box-shadow",
  "text-shadow": "text-shadow",
};
const WHOLE_VALUE: ReadonlySet<ValueNamespace> = new Set<ValueNamespace>(["shadow", "text-shadow", "color", "ease"]);
const WHOLE_VALUE_KIND: Readonly<Partial<Record<ValueNamespace, Lit["kind"]>>> = { shadow: "shadow", "text-shadow": "shadow", color: "colour", ease: "easing" };

export interface ValueToken {
  readonly name: string;
  readonly space: ValueNamespace;
  readonly lit: Lit;
  /** The one purpose this token serves, or null for a general scale step or role (`orb.purpose` in tokens.json). */
  readonly scope: string | null;
}

export interface ValueTokens {
  readonly all: readonly ValueToken[];
  /** Purposes in tokens.json whose variables the theme does not declare. */
  readonly staleScopes: readonly string[];
  /** `kind:canon` to the tokens that hold it, in file order. */
  readonly byValue: ReadonlyMap<string, readonly ValueToken[]>;
}

const valueKey = (found: Lit): string => `${found.kind}:${found.canon}`;

function argumentsOf(node: FunctionNode): readonly CssNode[] {
  return node.children.toArray().filter((child) => child.type !== "WhiteSpace" && child.type !== "Operator" && child.type !== "Identifier");
}

/** The one dimension a token expression stands for: `round(up, A, 1px)` is A; `max(A, B)` and `min(A, B)` are A when every argument is A. */
function singleDimension(node: CssNode): CssNode | null {
  if (node.type === "Dimension") {
    return node;
  }
  if (node.type !== "Function") {
    return null;
  }
  const name = node.name.toLowerCase();
  const args = argumentsOf(node).map(singleDimension);
  const first = args[0];
  if (first === null || first === undefined) {
    return null;
  }
  if (name === "round") {
    return first;
  }
  const canon = litsOf("width", first)[0]?.canon;
  return (name === "max" || name === "min") && args.every((arg) => arg !== null && litsOf("width", arg)[0]?.canon === canon) ? first : null;
}

function tokenLit(space: ValueNamespace, value: CssNode): Lit | null {
  const wholeKind = WHOLE_VALUE_KIND[space];
  if (WHOLE_VALUE.has(space) && wholeKind !== undefined) {
    return lit(wholeKind, normalised(value), normalised(value));
  }
  const children = value.type === "Value" ? value.children.toArray().filter((child) => child.type !== "WhiteSpace") : [value];
  const only = children.length === 1 ? children[0] : undefined;
  const node = only === undefined ? null : (singleDimension(only) ?? (only.type === "Function" ? null : only));
  const found = node === null ? undefined : litsOf(NAMESPACE_PROPERTY[space] ?? "width", node)[0];
  return found !== undefined && (VALUE_KINDS as readonly string[]).includes(found.kind) ? found : null;
}

const spaceOf = (name: string): ValueNamespace | undefined => VALUE_NAMESPACES.find((space) => name.startsWith(`--${space}-`));

/** The value tokens in the theme's `@theme` blocks and `:root`, each as the literal it holds. A token that is a formula holds no single value and is left out. */
export function loadValueTokens(root: string): ValueTokens {
  const ast = parse(readFileSync(join(root, THEME), "utf8"), { positions: false });
  const held: Omit<ValueToken, "scope">[] = [];
  const declared = new Set<string>();
  walk(ast, {
    enter(node): void {
      const inTheme = this.atrule?.name === "theme" || (this.rule !== null && normalised(this.rule.prelude) === ":root");
      if (node.type !== "Declaration" || !inTheme) {
        return;
      }
      declared.add(node.property);
      const space = spaceOf(node.property);
      const value = node.value.type === "Raw" ? parseValue(node.value.value.trim()) : node.value;
      const found = space === undefined || value === null ? null : tokenLit(space, value);
      if (space !== undefined && found !== null) {
        held.push({ name: node.property, space, lit: found });
      }
    },
  });
  const purposes = loadPurposes(root, declared);
  const all = held.map((token) => ({ ...token, scope: purposes.byName.get(token.name) ?? null }));
  const byValue = new Map<string, ValueToken[]>();
  for (const token of all) {
    byValue.set(valueKey(token.lit), [...(byValue.get(valueKey(token.lit)) ?? []), token]);
  }
  return { all, byValue, staleScopes: purposes.stale };
}

/** The tokens in the given namespaces that hold the literal, in namespace order. */
export function tokensHolding(tokens: ValueTokens, found: Lit, spaces: readonly ValueNamespace[]): readonly string[] {
  const held = tokens.byValue.get(valueKey(found)) ?? [];
  return spaces.flatMap((space) => held.filter((token) => token.space === space).map((token) => token.name));
}

const NUMERIC_KINDS: ReadonlySet<Lit["kind"]> = new Set<Lit["kind"]>(["length", "measure", "duration", "opacity", "z", "weight"]);

/** The closest token of the same kind in the given namespaces, for a literal no token holds; null for a kind that has no order. */
export function nearestToken(tokens: ValueTokens, found: Lit, spaces: readonly ValueNamespace[]): ValueToken | null {
  if (!NUMERIC_KINDS.has(found.kind)) {
    return null;
  }
  const amount = Number.parseFloat(found.canon);
  let best: ValueToken | null = null;
  let gap = Number.POSITIVE_INFINITY;
  for (const token of tokens.all) {
    const distance = Math.abs(Number.parseFloat(token.lit.canon) - amount);
    if (token.lit.kind === found.kind && spaces.includes(token.space) && distance < gap) {
      best = token;
      gap = distance;
    }
  }
  return best;
}

export function tailwindStepPx(step: string): number | null {
  if (step === "px") {
    return 1;
  }
  const amount = Number(step);
  return Number.isFinite(amount) ? amount * TAILWIND_STEP_PX : null;
}
