// Tailwind class tokens: which hand-rolled kind a token is, and every class string a source file writes.
import ts from "typescript";
import type { Elem } from "./source.ts";
import { elementsOf, lineOf, visit } from "./source.ts";
import type { TokenNamespace } from "./tokens.ts";
import { tailwindStepPx } from "./tokens.ts";

export interface TokenFact {
  readonly kind: string;
  /** The literal the token writes (a length, a colour), or null for a token with no single value. */
  readonly literal: string | null;
  readonly px: number | null;
  readonly namespaces: readonly TokenNamespace[];
}

const SIZE_UTILITY = /^(?:w|h|size|min-w|min-h|max-w|max-h|inline|block|min-inline|max-inline|min-block|max-block)-(\d+(?:\.\d+)?|px)$/u;
const SPACING_UTILITY = /^(?:p[xytrbsel]?|m[xytrbsel]?|gap(?:-[xy])?|space-[xy]|inset(?:-[xy])?|top|left|right|bottom|start|end)-(\d+(?:\.\d+)?|px)$/u;
const PALETTE =
  /^(?:bg|text|border|ring|fill|stroke|outline|decoration|from|via|to)-(?:white|black|slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)\b/u;
const VIEWPORT_VARIANT = /^(?:max-)?(?:sm|md|lg|xl|2xl):/u;

/** The part of a token after its last top-level variant colon, with the important marks and a negative sign removed. */
function baseOf(token: string): { readonly base: string; readonly variants: string; readonly important: boolean } {
  let depth = 0;
  let cut = -1;
  for (let index = 0; index < token.length; index += 1) {
    const char = token[index];
    if (char === "[" || char === "(") {
      depth += 1;
    } else if (char === "]" || char === ")") {
      depth -= 1;
    } else if (char === ":" && depth === 0) {
      cut = index;
    }
  }
  const raw = token.slice(cut + 1);
  const important = raw.startsWith("!") || raw.endsWith("!");
  return { base: raw.replace(/^!|!$/gu, "").replace(/^-/u, ""), variants: token.slice(0, cut + 1), important };
}

const REM_PX = 16;
const NONE: readonly TokenNamespace[] = [];

function fact(kind: string, literal: string | null = null, px: number | null = null, namespaces: readonly TokenNamespace[] = NONE): TokenFact {
  return { kind, literal, px, namespaces };
}

function arbitraryFact(base: string): TokenFact | null {
  const bracket = /(?<!\[)\[([^\]]*)\]/u.exec(base);
  if (bracket?.[1] === undefined) {
    return null;
  }
  const inner = bracket[1];
  if (/^(?:#|rgb|hsl|oklch|oklab|color:)/u.test(inner)) {
    return fact("tw-color-literal", inner);
  }
  if (inner.startsWith("clip-path")) {
    return fact("tw-clip", inner);
  }
  // A custom property, a formula and a keyword are structure the restricted-classes rule already admits.
  if (/^(?:--|var\(|calc\(|inherit$|url\()/u.test(inner)) {
    return null;
  }
  const length = /^(-?\d*\.?\d+)(px|rem)$/u.exec(inner);
  const px = length?.[1] === undefined ? null : Number(length[1]) * (length[2] === "rem" ? REM_PX : 1);
  return fact("tw-arbitrary", inner, px, ["spacing", "size", "width", "radius"]);
}

function rawNumberFact(base: string): TokenFact | null {
  const size = SIZE_UTILITY.exec(base);
  // Zero is structure, not a design number: the restricted-classes rule admits it too.
  if (size?.[1] !== undefined && size[1] !== "0") {
    return fact("tw-raw-size", size[1], tailwindStepPx(size[1]), ["size", "width"]);
  }
  const spacing = SPACING_UTILITY.exec(base);
  return spacing?.[1] === undefined || spacing[1] === "0" ? null : fact("tw-raw-spacing", spacing[1], tailwindStepPx(spacing[1]), ["spacing"]);
}

const SIMPLE: readonly (readonly [RegExp, string])[] = [
  [/^rounded(?:-[xytrbsel]{1,2})?(?:-(?:none|xs|sm|md|lg|xl|2xl|3xl))?$/u, "tw-radius"],
  [/^shadow(?:-(?:xs|sm|md|lg|xl|2xl|inner|none))?$/u, "tw-shadow"],
  [/^(?:border(?:-[xytrbse])?(?:-\d+)?|ring(?:-\d+)?|outline-\d+)$/u, "tw-border"],
  [/^opacity-\d+$/u, "tw-opacity"],
  [/^(?:bg|text|border|ring|fill|stroke|from|via|to)-[^\s/]+\/\d+$/u, "tw-alpha"],
  [/^z-(?:\d+|auto)$/u, "tw-z"],
  [/^(?:bg-(?:gradient|linear|radial|conic)|from-|via-|to-)/u, "tw-gradient"],
  [/^(?:translate-[xyz]|rotate|scale(?:-[xy])?|skew-[xy])-(?:\d+(?:\/\d+)?|px|full)$/u, "tw-transform"],
  [/^clip-/u, "tw-clip"],
];

/** The hand-rolled kind of one class token, or null for a token the system admits. */
export function classifyToken(token: string): TokenFact | null {
  const { base, variants, important } = baseOf(token);
  if (important) {
    return fact("tw-important", base);
  }
  if (base.includes("[")) {
    return arbitraryFact(base);
  }
  if (PALETTE.test(base) || /^(?:bg|text|border|ring|fill|stroke)-(?:white|black)(?:\/\d+)?$/u.test(base)) {
    return fact("tw-color-literal", base);
  }
  const numeric = rawNumberFact(base);
  if (numeric !== null) {
    return numeric;
  }
  const simple = SIMPLE.find(([pattern]) => pattern.test(base));
  if (simple !== undefined) {
    return fact(simple[1], base);
  }
  return VIEWPORT_VARIANT.test(variants) ? fact("tw-viewport-variant", variants) : null;
}

export interface ClassString {
  readonly path: string;
  readonly line: number;
  readonly tokens: readonly string[];
  readonly elem: Elem | null;
}

function stringsIn(node: ts.Node): readonly ts.Node[] {
  const found: ts.Node[] = [];
  visit(node, (inner) => {
    if (
      ts.isStringLiteral(inner) ||
      ts.isNoSubstitutionTemplateLiteral(inner) ||
      ts.isTemplateHead(inner) ||
      ts.isTemplateMiddle(inner) ||
      ts.isTemplateTail(inner)
    ) {
      found.push(inner);
    }
  });
  return found;
}

const CLASS_CALLEES = new Set(["cn", "cx", "tv", "cva", "clsx"]);

function classCallee(node: ts.Node): boolean {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_CALLEES.has(node.expression.text);
}

const CLASS_CONSTANT = /(?:CLASS|CLASSES|Class|Classes)$/u;

function literalText(node: ts.Node): string {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
    ? node.text
    : "";
}

// The string pieces of a class context at this node: a className attribute, a cn/tv call, or a *Class constant.
function classPieces(sf: ts.SourceFile, node: ts.Node, byOpening: ReadonlyMap<ts.Node, Elem>): readonly (readonly [ts.Node, Elem | null])[] {
  if (ts.isJsxAttribute(node) && node.name.getText(sf) === "className" && node.initializer !== undefined) {
    const elem = byOpening.get(node.parent.parent) ?? null;
    return stringsIn(node.initializer).map((piece) => [piece, elem] as const);
  }
  if (classCallee(node)) {
    return stringsIn(node).map((piece) => [piece, null] as const);
  }
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && CLASS_CONSTANT.test(node.name.text) && node.initializer !== undefined) {
    return stringsIn(node.initializer).map((piece) => [piece, null] as const);
  }
  return [];
}

/** Every class string a file writes: `className` attributes, `cn`/`tv` calls and `*Class` constants. */
export function classStringsOf(path: string, sf: ts.SourceFile): readonly ClassString[] {
  const out: ClassString[] = [];
  const emit = (node: ts.Node, elem: Elem | null): void => {
    const tokens = literalText(node)
      .split(/\s+/u)
      .filter((token) => token !== "");
    if (tokens.length > 0) {
      out.push({ path, line: lineOf(sf, node), tokens, elem });
    }
  };
  const byOpening = new Map<ts.Node, Elem>();
  for (const elem of elementsOf(sf)) {
    byOpening.set(elem.opening, elem);
  }
  visit(sf, (node) => {
    for (const [piece, elem] of classPieces(sf, node, byOpening)) {
      emit(piece, elem);
    }
  });
  return out;
}
