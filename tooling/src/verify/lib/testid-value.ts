// The story policy's lexical subject: a data-testid attribute whose value is a freeform string.
import type { Node } from "ts-morph";
import { Node as N } from "ts-morph";
import { readStringValue } from "./ast-read.ts";

const TESTID_ATTRIBUTE = "data-testid";

/** Does this `data-testid` initializer carry a FREEFORM string value — a bare `="foo"` StringLiteral, or a
 *  braced `={"foo"}` / `={"foo" as string}` / a braced template literal — as opposed to the typed
 *  `={testId("key")}` call (a non-literal expression, undefined) which is the sanctioned shape. */
function freeformTestidValue(init: Node | undefined): boolean {
  if (init === undefined) {
    return false;
  }
  if (N.isStringLiteral(init)) {
    return true;
  }
  if (!N.isJsxExpression(init)) {
    return false;
  }
  const expr = init.getExpression();
  return expr !== undefined && readStringValue(expr) !== undefined;
}

/** The freeform initializer of a `data-testid` attribute, or undefined when the attribute is typed or absent. */
export function freeformTestidInitializer(node: Node): Node | undefined {
  if (!N.isJsxAttribute(node) || node.getNameNode().getText() !== TESTID_ATTRIBUTE) {
    return;
  }
  const init = node.getInitializer();
  return freeformTestidValue(init) ? init : undefined;
}
