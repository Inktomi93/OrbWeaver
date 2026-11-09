// Small syntax readers the composition and hand-rolling scans share.
import ts from "typescript";
import { constInitializer, unwrap } from "../eslint/index.ts";

const MAX_HOPS = 3;

type Arithmetic = (left: number, right: number) => number;

const ARITHMETIC: ReadonlyMap<ts.SyntaxKind, Arithmetic> = new Map<ts.SyntaxKind, Arithmetic>([
  [ts.SyntaxKind.AsteriskToken, (left: number, right: number): number => left * right],
  [ts.SyntaxKind.PlusToken, (left: number, right: number): number => left + right],
  [ts.SyntaxKind.MinusToken, (left: number, right: number): number => left - right],
  [ts.SyntaxKind.SlashToken, (left: number, right: number): number => left / right],
]);

/** The number a literal or literal arithmetic writes; `follow` also opens a same-file const, a few hops deep. */
export function numberOf(expression: ts.Expression, follow = false, hops = 0): number | null {
  const node = unwrap(expression);
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (follow && ts.isIdentifier(node) && hops < MAX_HOPS) {
    const target = constInitializer(node.getSourceFile(), node.text);
    return target === null ? null : numberOf(target, follow, hops + 1);
  }
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    const inner = numberOf(node.operand, follow, hops);
    return inner === null ? null : -inner;
  }
  if (!ts.isBinaryExpression(node)) {
    return null;
  }
  const left = numberOf(node.left, follow, hops);
  const right = numberOf(node.right, follow, hops);
  if (left === null || right === null) {
    return null;
  }
  return ARITHMETIC.get(node.operatorToken.kind)?.(left, right) ?? null;
}

/**
 * The text a template writes when every substitution is a number known here (`${GAP}px` with `const GAP = 8`), else null.
 * A string substitution stays unread: its literal is read where it is declared, so inlining it would count it twice.
 */
export function staticTemplate(template: ts.TemplateExpression): string | null {
  let text = template.head.text;
  for (const span of template.templateSpans) {
    const amount = numberOf(span.expression, true);
    if (amount === null) {
      return null;
    }
    text += `${String(amount)}${span.literal.text}`;
  }
  return text;
}

export function enclosingFunction(node: ts.Node): ts.Node {
  for (let at: ts.Node = node.parent; !ts.isSourceFile(at); at = at.parent) {
    if (ts.isFunctionLike(at)) {
      return at;
    }
  }
  return node.getSourceFile();
}

/** Some node at or under `root` satisfies the test. */
export function anyNode(root: ts.Node, test: (node: ts.Node) => boolean): boolean {
  return test(root) || ts.forEachChild(root, (child) => (anyNode(child, test) ? true : undefined)) === true;
}

/** The argument is an object literal that names the property, written out or as a shorthand. */
export function hasProperty(argument: ts.Node | undefined, name: string): boolean {
  return (
    argument !== undefined &&
    ts.isObjectLiteralExpression(argument) &&
    argument.properties.some(
      (property) => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && property.name.getText() === name,
    )
  );
}

/** The identifier a call's result is bound to, or the names destructured from it. */
export function resultBinding(call: ts.CallExpression): { readonly name: string | null; readonly destructured: readonly string[] } {
  const parent = call.parent;
  if (!ts.isVariableDeclaration(parent)) {
    return { name: null, destructured: [] };
  }
  if (ts.isObjectBindingPattern(parent.name)) {
    return { name: null, destructured: parent.name.elements.map((element) => (element.propertyName ?? element.name).getText()) };
  }
  return { name: parent.name.getText(), destructured: [] };
}
