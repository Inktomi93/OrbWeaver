// Inline `style` props: a literal is a design value written by hand; anything computed is a runtime value and stays.
import ts from "typescript";
import type { Elem, Hit, Judgement, Lit, Place, Source, ValueTokens } from "../eslint/index.ts";
import { constInitializer, hitOf, judgeLit, keepJudgement, lineOf, litsOf, parseValue, unwrap } from "../eslint/index.ts";
import { numberOf, staticTemplate } from "./syntax.ts";

// React writes a bare number as pixels except on these.
const UNITLESS: ReadonlySet<string> = new Set([
  "opacity",
  "z-index",
  "font-weight",
  "flex",
  "flex-grow",
  "flex-shrink",
  "line-height",
  "order",
  "zoom",
  "aspect-ratio",
  "scale",
]);
const LAYOUT_DISPLAY = /^(?:inline-)?(?:flex|grid)$/u;

const kebab = (key: string): string => key.replace(/[A-Z]/gu, (letter) => `-${letter.toLowerCase()}`);

/** A value a style property can take that the syntax knows: a literal, a number held in a same-file const, or a template of known numbers. */
interface Leaf {
  readonly text: string;
  readonly numeric: boolean;
  /** The source the write shows, so a value read through a const names the const. */
  readonly shown: string;
}

/**
 * The leaves a style value can take: itself, or the branches of a conditional, `??` and `||`.
 * A const is opened only for a number: a string const is read where it is declared, so opening it here would count it twice.
 */
function literalLeaves(expression: ts.Expression): readonly Leaf[] {
  const node = unwrap(expression);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return [{ text: node.text, numeric: false, shown: node.getText() }];
  }
  const amount = numberOf(node, true);
  if (amount !== null) {
    return [{ text: String(amount), numeric: true, shown: node.getText() }];
  }
  const built = ts.isTemplateExpression(node) ? staticTemplate(node) : null;
  if (built !== null) {
    return [{ text: built, numeric: false, shown: node.getText() }];
  }
  if (ts.isConditionalExpression(node)) {
    return [...literalLeaves(node.whenTrue), ...literalLeaves(node.whenFalse)];
  }
  const either = ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind);
  return either ? [...literalLeaves(node.left), ...literalLeaves(node.right)] : [];
}

function leafLits(property: string, leaf: Leaf): readonly Lit[] {
  if (leaf.numeric) {
    const amount = Number(leaf.text);
    const text = UNITLESS.has(property) || amount === 0 ? leaf.text : `${leaf.text}px`;
    const node = parseValue(text);
    return node === null ? [] : litsOf(property, node);
  }
  const node = parseValue(leaf.text);
  return node === null ? [] : litsOf(property, node);
}

interface StyleWrite {
  readonly property: string;
  readonly detail: string;
  readonly line: number;
  readonly lits: readonly Lit[];
  readonly keyword: string | null;
}

/** The object a style prop holds: an inline literal, or a same-file const of one. */
function styleObject(sf: ts.SourceFile, expression: ts.Expression): ts.ObjectLiteralExpression | null {
  const node = unwrap(expression);
  const resolved = ts.isIdentifier(node) ? constInitializer(sf, node.text) : node;
  return resolved !== null && ts.isObjectLiteralExpression(resolved) ? resolved : null;
}

function keyOf(property: ts.ObjectLiteralElementLike): string | null {
  if (!ts.isPropertyAssignment(property)) {
    return null;
  }
  return ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text : null;
}

function writesOf(sf: ts.SourceFile, property: ts.ObjectLiteralElementLike): readonly StyleWrite[] {
  const key = keyOf(property);
  const line = lineOf(sf, property);
  if (key === null || !ts.isPropertyAssignment(property)) {
    return [];
  }
  const name = key.startsWith("--") ? key : kebab(key);
  return literalLeaves(property.initializer).map((leaf) => ({
    property: name,
    detail: `${key}: ${leaf.shown}`,
    line,
    lits: leafLits(name, leaf),
    keyword: leaf.numeric ? null : leaf.text.trim(),
  }));
}

function judgeWrite(write: StyleWrite, tokens: ValueTokens): readonly { readonly judgement: Judgement; readonly detail: string; readonly layout: boolean }[] {
  if (write.lits.length > 0) {
    return write.lits.map((found) => ({
      judgement: judgeLit(found, write.property.startsWith("--") ? null : write.property, tokens),
      detail: write.detail,
      layout: false,
    }));
  }
  // `var(--token)` and a bare number on a unitless property are legal; a keyword is a utility or a layout primitive.
  const keyword = write.keyword;
  if (keyword === null || keyword.includes("var(") || write.property.startsWith("--")) {
    return [];
  }
  const layout = write.property === "display" && LAYOUT_DISPLAY.test(keyword);
  const judgement: Judgement = layout
    ? {
        verdict: "primitive",
        match: "Stack, Row or Grid (@orb/ui/layout)",
        owner: "Stack, Row or Grid (@orb/ui/layout)",
        reason: "a flex or grid container is a layout primitive",
        keep: null,
      }
    : {
        verdict: "recipe",
        match: null,
        owner: `utility: ${write.property}`,
        reason: `a static ${write.property} keyword is a token utility or a primitive prop`,
        keep: null,
      };
  return [{ judgement, detail: write.detail, layout }];
}

/** One hit per literal the element's `style` prop writes; a computed value or a style object that is not a literal reads as a runtime value. */
export function styleHits(source: Source, sf: ts.SourceFile, elem: Elem, tokens: ValueTokens): readonly Hit[] {
  const initializer = elem.attrs.get("style")?.initializer;
  if (initializer === undefined || !ts.isJsxExpression(initializer) || initializer.expression === undefined) {
    return [];
  }
  const at = (line: number): Place => ({ path: source.path, line, section: source.section, layer: source.layer });
  const object = styleObject(sf, initializer.expression);
  if (object === null) {
    return [
      hitOf(at(elem.line), { category: "inline-style", where: "style", detail: "style={…}" }, keepJudgement("runtime-value", "style is not an inline object")),
    ];
  }
  return object.properties.flatMap((property) => {
    const writes = writesOf(sf, property);
    if (writes.length === 0) {
      return [
        hitOf(
          at(lineOf(sf, property)),
          { category: "inline-style", where: "style", detail: property.getText(sf).slice(0, 60) },
          keepJudgement("runtime-value", "a computed style value"),
        ),
      ];
    }
    return writes.flatMap((write) =>
      judgeWrite(write, tokens).map(({ judgement, detail, layout }) =>
        hitOf(at(write.line), { category: layout ? "hand-built" : "inline-style", where: "style", detail }, judgement),
      ),
    );
  });
}
