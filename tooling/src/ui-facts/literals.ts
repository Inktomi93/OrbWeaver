// The literal values a CSS value holds, read from the css-tree AST: what each one is, so a token can be asked whether it holds it.
import type { CssNode, FunctionNode, ListItem } from "@eslint/css-tree";
import { generate, parse, walk } from "@eslint/css-tree";

const REM_PX = 16;
const MS_PER_SECOND = 1000;
const PRECISION = 4;
const PERCENT = 100;

/** Kinds a token can hold. */
export const VALUE_KINDS = ["length", "measure", "duration", "opacity", "z", "weight", "shadow", "colour", "easing"] as const;
export type ValueKind = (typeof VALUE_KINDS)[number];

/** Kinds that are CSS structure or have no token family: they are classified, never matched. */
const STRUCTURAL_KINDS = ["zero", "relative", "angle", "derived", "mechanism", "gradient", "floor", "unit"] as const;
type StructuralKind = (typeof STRUCTURAL_KINDS)[number];

export type LitKind = ValueKind | StructuralKind;

export interface Lit {
  readonly kind: LitKind;
  /** The value in one unit per kind: `16px`, `130ms`, `0.6`, `50`, or the normalised text of a colour, shadow or easing. */
  readonly canon: string;
  /** The value as written. */
  readonly text: string;
}

const LENGTH_UNIT_PX: Readonly<Record<string, number>> = { px: 1, rem: REM_PX };
const TIME_UNIT_MS: Readonly<Record<string, number>> = { ms: 1, s: MS_PER_SECOND };
const ANGLE_UNITS: ReadonlySet<string> = new Set(["deg", "rad", "turn", "grad"]);
const COLOUR_FUNCTIONS: ReadonlySet<string> = new Set(["oklch", "oklab", "lab", "lch", "rgb", "rgba", "hsl", "hsla", "hwb", "color"]);
const EASING_FUNCTIONS: ReadonlySet<string> = new Set(["cubic-bezier", "steps"]);
const OPAQUE_FUNCTIONS: ReadonlySet<string> = new Set(["url", "image-set", "attr"]);
const OPACITY_PROPERTIES: ReadonlySet<string> = new Set(["opacity", "fill-opacity", "stroke-opacity", "flood-opacity", "stop-opacity"]);
// Transform, clip, mask and track formulas are the CSS mechanism itself: no length token family prices them.
const MECHANISM_PROPERTY =
  /^(?:transform|translate|rotate|scale|perspective|clip-path|mask(?:-.+)?|offset(?:-.+)?|transform-origin|object-position|background-position|grid-template(?:-.+)?|grid-auto-.+|aspect-ratio)$/u;
const SHADOW_PROPERTY = /^(?:box|text)-shadow$/u;
const HEX_COLOUR = /^(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;

/** The length properties a bare `0` is a sentinel for. */
const ZERO_PROPERTY =
  /^(?:padding|margin|gap|row-gap|column-gap|inset|top|right|bottom|left|width|height|min-.+|max-.+|border(?:-.+)?-width|border(?:-.+)?-radius|outline-offset|flex-basis)(?:-.+)?$/u;

export const lit = (kind: LitKind, canon: string, text: string = canon): Lit => ({ kind, canon, text });

const round = (amount: number): number => Number(amount.toFixed(PRECISION));

/** The node as written, spacing collapsed. */
export const written = (node: CssNode): string => generate(node).replace(/\s+/gu, " ").trim();

/** The node as written, lower-cased, so equal values compare equal. */
export const normalised = (node: CssNode): string => written(node).toLowerCase();

export function parseValue(text: string): CssNode | null {
  try {
    return parse(text, { context: "value" });
  } catch {
    return null;
  }
}

function dimensionLit(amount: number, unit: string, text: string): Lit {
  const lower = unit.toLowerCase();
  if (amount === 0) {
    return lit("zero", "0", text);
  }
  const px = LENGTH_UNIT_PX[lower];
  if (px !== undefined) {
    return lit("length", `${round(amount * px)}px`, text);
  }
  const ms = TIME_UNIT_MS[lower];
  if (ms !== undefined) {
    const millis = round(amount * ms);
    // Under a millisecond is not an animation time: it is the shortest value that still fires the transition events.
    return lit(millis < 1 ? "floor" : "duration", `${millis}ms`, text);
  }
  if (lower === "ch") {
    return lit("measure", `${round(amount)}ch`, text);
  }
  return lit(ANGLE_UNITS.has(lower) ? "angle" : "relative", `${round(amount)}${lower}`, text);
}

function numberLit(property: string | null, amount: number, text: string): Lit | null {
  if (property === null) {
    return null;
  }
  if (OPACITY_PROPERTIES.has(property)) {
    return amount === 0 || amount === 1 ? lit("zero", String(amount), text) : lit("opacity", String(round(amount)), text);
  }
  if (property === "z-index") {
    // 0, 1 and -1 order a node against its own siblings; the z tokens order layers against each other.
    return Math.abs(amount) <= 1 ? lit("zero", String(amount), text) : lit("z", String(amount), text);
  }
  if (property === "font-weight") {
    return lit("weight", String(amount), text);
  }
  return amount === 0 && ZERO_PROPERTY.test(property) ? lit("zero", "0", text) : null;
}

function percentageLit(property: string | null, amount: number, text: string): Lit {
  if (property !== null && OPACITY_PROPERTIES.has(property)) {
    return amount === 0 || amount === PERCENT ? lit("zero", String(amount / PERCENT), text) : lit("opacity", String(round(amount / PERCENT)), text);
  }
  return lit("relative", `${round(amount)}%`, text);
}

const argumentNodes = (node: FunctionNode): readonly CssNode[] => node.children.toArray().filter((child) => child.type !== "WhiteSpace");

function functionLit(node: FunctionNode): Lit | null {
  const name = node.name.toLowerCase();
  const text = normalised(node);
  if (COLOUR_FUNCTIONS.has(name)) {
    // A relative colour starts with `from`: it derives from a token, so its numbers are composition, not values.
    const first = argumentNodes(node)[0];
    return first?.type === "Identifier" && first.name.toLowerCase() === "from" ? lit("derived", text) : lit("colour", text);
  }
  if (name === "color-mix") {
    return lit("derived", text);
  }
  if (name.endsWith("gradient")) {
    return lit("gradient", text);
  }
  return EASING_FUNCTIONS.has(name) ? lit("easing", text) : null;
}

/** True when the value holds a number the CSS mechanism properties would price. */
function holdsNumber(value: CssNode): boolean {
  let found = false;
  walk(value, {
    enter(node): void {
      if ((node.type === "Dimension" || node.type === "Number" || node.type === "Percentage") && Number(node.value) !== 0) {
        found = true;
      }
    },
  });
  return found;
}

function holdsLiteral(value: CssNode): boolean {
  let found = false;
  walk(value, {
    enter(node): void {
      if (node.type === "Dimension" || node.type === "Hash" || (node.type === "Function" && COLOUR_FUNCTIONS.has(node.name.toLowerCase()))) {
        found = true;
      }
    },
  });
  return found;
}

const isMultiply = (node: CssNode | undefined): boolean => node?.type === "Operator" && node.value === "*";

/** A `1<unit>` beside a `*` is a unit, not a length: it turns a unitless dial into the length the dial means. */
function isUnitCast(node: CssNode & { value: string }, item: ListItem<CssNode> | undefined): boolean {
  const near = (step: ListItem<CssNode> | null | undefined): CssNode | undefined => (step?.data.type === "WhiteSpace" ? step.prev?.data : step?.data);
  const after = (step: ListItem<CssNode> | null | undefined): CssNode | undefined => (step?.data.type === "WhiteSpace" ? step.next?.data : step?.data);
  return Number(node.value) === 1 && (isMultiply(near(item?.prev)) || isMultiply(after(item?.next)));
}

/** Every literal a property's value writes, in source order. Mechanism properties and shadows read as one literal each. */
export function litsOf(property: string | null, value: CssNode): readonly Lit[] {
  const name = property?.toLowerCase() ?? null;
  const text = normalised(value);
  if (name !== null && MECHANISM_PROPERTY.test(name)) {
    return holdsNumber(value) ? [lit("mechanism", text)] : [];
  }
  if (name !== null && SHADOW_PROPERTY.test(name)) {
    return holdsLiteral(value) ? [lit("shadow", text)] : [];
  }
  const out: Lit[] = [];
  walk(value, {
    enter(node, item): symbol | undefined {
      if (node.type === "Dimension" && isUnitCast(node, item)) {
        out.push(lit("unit", `${round(Number(node.value))}${node.unit.toLowerCase()}`, `${node.value}${node.unit}`));
        return undefined;
      }
      if (node.type === "Function") {
        const found = functionLit(node);
        if (found !== null) {
          out.push(found);
        }
        return found !== null || OPAQUE_FUNCTIONS.has(node.name.toLowerCase()) ? walk.skip : undefined;
      }
      const found = leafLit(name, node);
      if (found !== null) {
        out.push(found);
      }
      return undefined;
    },
  });
  return out;
}

function leafLit(property: string | null, node: CssNode): Lit | null {
  if (node.type === "Dimension") {
    return dimensionLit(Number(node.value), node.unit, `${node.value}${node.unit}`);
  }
  if (node.type === "Percentage") {
    return percentageLit(property, Number(node.value), `${node.value}%`);
  }
  if (node.type === "Number") {
    return numberLit(property, Number(node.value), node.value);
  }
  // `#review` is a URL fragment, not a colour.
  if (node.type === "Hash" && HEX_COLOUR.test(node.value)) {
    return lit("colour", `#${node.value.toLowerCase()}`, `#${node.value}`);
  }
  return null;
}

/** True when a value is one a stylesheet would write: numbers with units, colours and the functions that combine them. */
function onlyValues(root: CssNode): boolean {
  let pure = true;
  walk(root, {
    enter(node): void {
      const allowed =
        node.type === "Value" ||
        node.type === "Dimension" ||
        node.type === "Number" ||
        node.type === "Percentage" ||
        node.type === "Hash" ||
        node.type === "Operator" ||
        node.type === "WhiteSpace" ||
        (node.type === "Function" &&
          (COLOUR_FUNCTIONS.has(node.name.toLowerCase()) || ["calc", "min", "max", "clamp", "round"].includes(node.name.toLowerCase())));
      pure = pure && allowed;
    },
  });
  return pure;
}

const isTokenKind = (found: Lit): boolean => (VALUE_KINDS as readonly string[]).includes(found.kind);

/** The token-priced literals of a string that is a CSS value on its own (`"20rem"`, `"#fff"`); empty for any other string. */
export function valueStringLits(text: string, property: string | null = null): readonly Lit[] {
  const root = parseValue(text);
  return root !== null && onlyValues(root) ? litsOf(property, root).filter(isTokenKind) : [];
}

/** The literals of a media or container condition written as a string, `(min-width: 48rem)`. */
export function conditionStringLits(text: string): readonly Lit[] {
  let root: CssNode;
  try {
    root = parse(text, { context: "atrulePrelude", atrule: "media" });
  } catch {
    return [];
  }
  return conditionLits(root);
}

/** Every length in a media or container prelude. */
export function conditionLits(prelude: CssNode): readonly Lit[] {
  const out: Lit[] = [];
  walk(prelude, {
    enter(node): void {
      if (node.type === "Dimension") {
        const found = dimensionLit(Number(node.value), node.unit, `${node.value}${node.unit}`);
        if (isTokenKind(found)) {
          out.push(found);
        }
      }
    },
  });
  return out;
}
