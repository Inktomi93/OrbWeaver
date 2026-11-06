// Tailwind class tokens: which hand-rolled kind a token is, and every class string a source file writes.
import { posix } from "node:path";
import ts from "typescript";
import type { Elem, Source } from "./source.ts";
import { constInitializers, elementsOf, lineOf, visit } from "./source.ts";
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
/** A colour utility at an alpha, by number or by a named `--opacity-*` step; the group is the colour. */
export const ALPHA_UTILITY = /^(?:bg|text|border|ring|fill|stroke|from|via|to)-([^\s/]+)\/[^\s/]+$/u;

/** The part of a token after its last top-level variant colon, with the important marks and a negative sign removed. */
export function baseOf(token: string): { readonly base: string; readonly variants: string; readonly important: boolean } {
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
  [ALPHA_UTILITY, "tw-alpha"],
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
  /** The string is applied only when something else holds: a branch of a ternary, the right side of `&&`, `||` or `??`, a class-object key, a value of a lookup map, or an argument of a helper. */
  readonly conditional: boolean;
  /** The string is a plain literal; a template piece is not. */
  readonly plain: boolean;
  /** Every class the same root writes, this string's included. */
  readonly rootTokens: readonly string[];
  /** The root reads an expression before this string. */
  readonly opaqueBefore: boolean;
}

const CLASS_CALLEES = new Set(["cn", "cx", "tv", "cva", "clsx"]);
const RECIPE_CALLEES = new Set(["tv", "cva"]);

function classCallee(node: ts.Node): boolean {
  return ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_CALLEES.has(node.expression.text);
}

const EQUALITY: ReadonlySet<ts.SyntaxKind> = new Set([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);
const GUARDING: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken]);
// Inside a `tv()` config these hold conditions and defaults, never classes; only a `class` or `className` property of a compound entry does.
const RECIPE_STATE = new Set(["defaultVariants", "compoundVariants", "compoundSlots"]);
const RECIPE_CLASS = new Set(["class", "className"]);

const propertyName = (node: ts.Node): string | null =>
  ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) ? node.name.text : null;

/** The properties between a string and the root that encloses it, nearest first. */
function enclosingProperties(node: ts.Node, root: ts.Node): readonly string[] {
  const names: string[] = [];
  for (let parent = node.parent; !ts.isSourceFile(parent) && parent !== root.parent; parent = parent.parent) {
    const name = propertyName(parent);
    if (name !== null) {
      names.push(name);
    }
  }
  return names;
}

const isRecipeRoot = (root: ts.Node): boolean => ts.isCallExpression(root) && ts.isIdentifier(root.expression) && RECIPE_CALLEES.has(root.expression.text);

/** A string that names a variant arm, sets a default arm or is compared with a value is not class text. */
function isLabel(node: ts.Node, root: ts.Node): boolean {
  const parent = node.parent;
  if (ts.isBinaryExpression(parent) && EQUALITY.has(parent.operatorToken.kind)) {
    return true;
  }
  if (ts.isElementAccessExpression(parent) && parent.argumentExpression === node) {
    return true;
  }
  if (!isRecipeRoot(root)) {
    return false;
  }
  if (ts.isPropertyAssignment(parent) && parent.name === node) {
    return true;
  }
  const names = enclosingProperties(node, root);
  const [nearest] = names;
  return names.includes("defaultVariants") || (names.some((name) => RECIPE_STATE.has(name)) && !RECIPE_CLASS.has(nearest ?? ""));
}

/** The string is applied only when something else holds. */
function isConditional(node: ts.Node, root: ts.Node): boolean {
  for (let child = node; child !== root; child = child.parent) {
    const parent = child.parent;
    if (ts.isConditionalExpression(parent) && parent.condition !== child) {
      return true;
    }
    if (ts.isBinaryExpression(parent) && GUARDING.has(parent.operatorToken.kind) && parent.right === child) {
      return true;
    }
    // A `cn({ "p-row": isRow })` key is a class applied when its value holds; a value of `{ open: "p-row" }[state]` is a class the lookup picks.
    if (ts.isPropertyAssignment(parent) && !isRecipeRoot(root)) {
      return true;
    }
    // A helper other than a class joiner decides what happens to its arguments.
    if (ts.isCallExpression(parent) && parent.expression !== child && !classCallee(parent)) {
      return true;
    }
  }
  return false;
}

/** The node decides whether a class applies, rather than being one: the left of `&&`, `||` or `??`, or a ternary's condition. */
function isGuard(node: ts.Node, root: ts.Node): boolean {
  for (let child = node; child !== root; child = child.parent) {
    const parent = child.parent;
    if (
      (ts.isConditionalExpression(parent) && parent.condition === child) ||
      (ts.isBinaryExpression(parent) && GUARDING.has(parent.operatorToken.kind) && parent.left === child)
    ) {
      return true;
    }
  }
  return false;
}

/** An expression before the piece can hold a class the syntax cannot read. A guard's own read and a call's name do not write one. */
function readsBefore(piece: ts.Node, root: ts.Node): boolean {
  let found = false;
  visit(root, (node) => {
    const callee = ts.isCallExpression(node.parent) && node.parent.expression === node;
    found ||= ts.isIdentifier(node) && !callee && node.getEnd() <= piece.getStart() && !isGuard(node, root);
  });
  return found;
}

interface ClassPiece {
  readonly node: ts.Node;
  readonly conditional: boolean;
  readonly opaqueBefore: boolean;
}

function piecesIn(root: ts.Node): readonly ClassPiece[] {
  const found: ClassPiece[] = [];
  visit(root, (inner) => {
    const text =
      ts.isStringLiteral(inner) ||
      ts.isNoSubstitutionTemplateLiteral(inner) ||
      ts.isTemplateHead(inner) ||
      ts.isTemplateMiddle(inner) ||
      ts.isTemplateTail(inner);
    if (text && !isLabel(inner, root)) {
      found.push({ node: inner, conditional: isConditional(inner, root), opaqueBefore: readsBefore(inner, root) });
    }
  });
  return found;
}

const CLASS_CONSTANT = /(?:CLASS|CLASSES|Class|Classes)$/u;
// `className` on an element, and the `*ClassName` props a composite forwards to a part it renders.
const CLASS_ATTRIBUTE = /^(?:className|[a-z][A-Za-z]*ClassName)$/u;

function literalText(node: ts.Node): string {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)
    ? node.text
    : "";
}

const tokensOf = (node: ts.Node): readonly string[] =>
  literalText(node)
    .split(/\s+/u)
    .filter((token) => token !== "");

const declaredName = (node: ts.Node): string | null => (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) ? node.name.text : null);

// The node whose string pieces are class text: a class attribute, a cn/tv call, or the initializer of a constant that
// is named like a class or that a class context reads (`referenced`, as `path#name`).
function classRoot(path: string, sf: ts.SourceFile, node: ts.Node, referenced: ReadonlySet<string>): ts.Node | null {
  if (ts.isJsxAttribute(node)) {
    return CLASS_ATTRIBUTE.test(node.name.getText(sf)) ? (node.initializer ?? null) : null;
  }
  if (classCallee(node)) {
    return node;
  }
  const name = declaredName(node);
  const init = ts.isVariableDeclaration(node) ? node.initializer : undefined;
  return name !== null && init !== undefined && (CLASS_CONSTANT.test(name) || referenced.has(`${path}#${name}`)) ? init : null;
}

/** The names a class context reads: an identifier outside a property key, a property name or a call's callee. */
function namesIn(root: ts.Node): ReadonlySet<string> {
  const names = new Set<string>();
  visit(root, (node) => {
    const parent = node.parent;
    const skipped =
      (ts.isPropertyAccessExpression(parent) && parent.name === node) ||
      (ts.isPropertyAssignment(parent) && parent.name === node) ||
      (ts.isCallExpression(parent) && parent.expression === node);
    if (ts.isIdentifier(node) && !skipped) {
      names.add(node.text);
    }
  });
  return names;
}

/** Relative imports of a file by local name: the constant they bring is `path#name` in the module they name. */
function importedConstants(path: string, sf: ts.SourceFile, known: ReadonlyMap<string, ts.SourceFile>): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const statement of sf.statements) {
    if (!(ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier) && statement.moduleSpecifier.text.startsWith("."))) {
      continue;
    }
    const target = posix.join(posix.dirname(path), statement.moduleSpecifier.text);
    const bindings = statement.importClause?.namedBindings;
    if (known.has(target) && bindings !== undefined && ts.isNamedImports(bindings)) {
      for (const specifier of bindings.elements) {
        map.set(specifier.name.text, `${target}#${(specifier.propertyName ?? specifier.name).text}`);
      }
    }
  }
  return map;
}

/**
 * The constants, as `path#name`, that a class context reads however they are named: in the file that declares them or in
 * a file that imports them by a relative path. Follows a constant into the constants it reads. Scope is not read.
 */
export function referencedClassConstants(sources: readonly Source[]): ReadonlySet<string> {
  const known = new Map(sources.flatMap((source) => (source.sf === null ? [] : [[source.path, source.sf] as const])));
  const imports = new Map<string, ReadonlyMap<string, string>>();
  const found = new Set<string>();
  const queue: string[] = [];
  const reach = (path: string, sf: ts.SourceFile, root: ts.Node): void => {
    const brought = imports.get(path) ?? importedConstants(path, sf, known);
    imports.set(path, brought);
    for (const name of namesIn(root)) {
      const key = constInitializers(sf).has(name) ? `${path}#${name}` : brought.get(name);
      if (key !== undefined && !found.has(key)) {
        found.add(key);
        queue.push(key);
      }
    }
  };
  for (const [path, sf] of known) {
    visit(sf, (node) => {
      const root = classRoot(path, sf, node, found);
      if (root !== null) {
        reach(path, sf, root);
      }
    });
  }
  for (const key of queue) {
    const [path = "", name = ""] = key.split("#");
    const sf = known.get(path);
    const init = sf === undefined ? undefined : constInitializers(sf).get(name);
    if (sf !== undefined && init !== undefined) {
      reach(path, sf, init);
    }
  }
  return found;
}

/** Every class string a file writes: class attributes, `cn`/`tv` calls, `*Class` constants and the constants a class context reads. */
export function classStringsOf(path: string, sf: ts.SourceFile, referenced: ReadonlySet<string>): readonly ClassString[] {
  const out: ClassString[] = [];
  const emitted = new Set<ts.Node>();
  const emit = ({ node, conditional, opaqueBefore }: ClassPiece, elem: Elem | null, rootTokens: readonly string[]): void => {
    const tokens = tokensOf(node);
    if (tokens.length > 0 && !emitted.has(node)) {
      emitted.add(node);
      out.push({ path, line: lineOf(sf, node), tokens, elem, conditional, plain: ts.isStringLiteral(node), rootTokens, opaqueBefore });
    }
  };
  const byOpening = new Map<ts.Node, Elem>();
  for (const elem of elementsOf(sf)) {
    byOpening.set(elem.opening, elem);
  }
  visit(sf, (node) => {
    const root = classRoot(path, sf, node, referenced);
    if (root === null) {
      return;
    }
    // Only `className` styles the element it is written on; a `*ClassName` prop styles a part inside a composite.
    const elem = ts.isJsxAttribute(node) && node.name.getText(sf) === "className" ? (byOpening.get(node.parent.parent) ?? null) : null;
    const pieces = piecesIn(root);
    const rootTokens = pieces.flatMap((piece) => tokensOf(piece.node));
    for (const piece of pieces) {
      emit(piece, elem, rootTokens);
    }
  });
  return out;
}
