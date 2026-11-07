// What a class expression can write, read closed: anything outside the named shapes is opaque, so what the proof cannot read refuses.
import ts from "typescript";
import { constInitializer, unwrap } from "./source.ts";

const MAX_HOPS = 3;

const CLASS_JOINERS: ReadonlySet<string> = new Set(["cn", "cx", "clsx"]);

export type ClassExpression =
  | { readonly kind: "classes"; readonly tokens: readonly string[] }
  | { readonly kind: "join"; readonly parts: readonly ClassExpression[] }
  | { readonly kind: "choice"; readonly guard: string; readonly chosen: ClassExpression; readonly otherwise: ClassExpression }
  | { readonly kind: "opaque"; readonly text: string };

const NOTHING: ClassExpression = { kind: "classes", tokens: [] };
const FALSY: ReadonlySet<ts.SyntaxKind> = new Set([ts.SyntaxKind.NullKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.UndefinedKeyword]);

export const isJoinerCall = (node: ts.Node): node is ts.CallExpression =>
  ts.isCallExpression(node) && ts.isIdentifier(node.expression) && CLASS_JOINERS.has(node.expression.text);

/** The classes an expression writes. The left of `&&` and a ternary's condition decide; the left of `??` and `||` is a value, so it is opaque. */
export function readClassExpression(expression: ts.Expression, hops = 0): ClassExpression {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) {
    return { kind: "classes", tokens: node.text.split(/\s+/u).filter((token) => token !== "") };
  }
  if (FALSY.has(node.kind) || (ts.isIdentifier(node) && node.text === "undefined")) {
    return NOTHING;
  }
  if (isJoinerCall(node)) {
    return { kind: "join", parts: node.arguments.map((argument) => readClassExpression(argument, hops)) };
  }
  if (ts.isConditionalExpression(node)) {
    const [chosen, otherwise] = [readClassExpression(node.whenTrue, hops), readClassExpression(node.whenFalse, hops)];
    return { kind: "choice", guard: node.condition.getText(), chosen, otherwise };
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return { kind: "choice", guard: node.left.getText(), chosen: readClassExpression(node.right, hops), otherwise: NOTHING };
  }
  const target = ts.isIdentifier(node) && hops < MAX_HOPS ? constInitializer(node.getSourceFile(), node.text) : null;
  return target === null ? { kind: "opaque", text: node.getText() } : readClassExpression(target, hops + 1);
}

/** The first expression the reader could not open, or null when every class is known. */
export function opaqueIn(expression: ClassExpression): string | null {
  switch (expression.kind) {
    case "classes":
      return null;
    case "opaque":
      return expression.text;
    case "join":
      return expression.parts.map(opaqueIn).find((text) => text !== null) ?? null;
    case "choice":
      return opaqueIn(expression.chosen) ?? opaqueIn(expression.otherwise);
  }
}

/** Every class the expression can write, whatever guards it. */
export function classesIn(expression: ClassExpression): readonly string[] {
  switch (expression.kind) {
    case "classes":
      return expression.tokens;
    case "opaque":
      return [];
    case "join":
      return expression.parts.flatMap(classesIn);
    case "choice":
      return [...classesIn(expression.chosen), ...classesIn(expression.otherwise)];
  }
}

export function guardsIn(expression: ClassExpression): readonly string[] {
  switch (expression.kind) {
    case "join":
      return expression.parts.flatMap(guardsIn);
    case "choice":
      return [expression.guard, ...guardsIn(expression.chosen), ...guardsIn(expression.otherwise)];
    case "classes":
    case "opaque":
      return [];
  }
}

/** The class string the expression writes when exactly the given guards hold. */
export function classesWhen(expression: ClassExpression, held: ReadonlySet<string>): string {
  switch (expression.kind) {
    case "classes":
      return expression.tokens.join(" ");
    case "opaque":
      return "";
    case "join":
      return expression.parts.map((part) => classesWhen(part, held)).join(" ");
    case "choice": {
      const branch = held.has(expression.guard) ? expression.chosen : expression.otherwise;
      return classesWhen(branch, held);
    }
  }
}
