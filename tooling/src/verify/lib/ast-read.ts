// Shared value-extraction readers for gates (the house `unwrap` idiom, promoted to ONE home).
//
// A gate that reads a value off a narrow node check — e.g. `Node.isStringLiteral(init) ?
// init.getLiteralText() : undefined` — returns undefined on `id: "x" as never` (AsExpression), a
// parenthesized literal `(… )`, a `… satisfies T` expression, or a `\`x\`` NoSubstitutionTemplate, and
// then SILENTLY PASSES the violation. False-negative GREEN is the worst gate failure mode (the same
// class as the scanRoot-format precedent). These readers strip the wrappers first, so a value written in
// any of those honest-authoring shapes is still seen. Hardening only ever WIDENS what a gate detects.
import { Node } from "ts-morph";

/** Strip `as X` / `satisfies X` / parentheses wrappers so the underlying literal/object/call is reachable.
 *  Mirrors the local `unwrap` in zustand-selector-derived.ts / diagnostic-legibility.ts. */
export function unwrapExpression(node: Node): Node {
  let n = node;
  while (Node.isAsExpression(n) || Node.isSatisfiesExpression(n) || Node.isParenthesizedExpression(n)) {
    n = n.getExpression();
  }
  return n;
}

/** The literal string value of a `StringLiteral` or `NoSubstitutionTemplateLiteral`, seen THROUGH any
 *  `as`/`satisfies`/paren wrapper; undefined for a genuinely non-literal (an identifier, a call, a
 *  template WITH `${}` substitutions). Use this wherever a gate compares an authored string value —
 *  ids/zones/placements/keys/kinds — so a wrapped literal can't slip the check. */
export function readStringValue(node: Node): string | undefined {
  const n = unwrapExpression(node);
  return Node.isStringLiteral(n) || Node.isNoSubstitutionTemplateLiteral(n) ? n.getLiteralText() : undefined;
}
