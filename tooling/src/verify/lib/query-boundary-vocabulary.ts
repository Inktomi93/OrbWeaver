// The query-boundary RESERVATION vocabulary (#885) — the family reader shared by `query-boundary-reservation`
// (the occurrence policy: an unkeyed static-count skeleton fallback reserves a guess) and
// `query-boundary-reservation-health` (the tripwires: a duplicated literal key, and the seam's own home no
// longer spelling `reserveKey`), so the two halves of the law cannot drift on the element, the attribute or
// the home they judge.
//
// Pure data plus attribute readers over a delivered JSX element: no walk, no Project, no filesystem. The
// same-file const lookup is a STATEMENT-level read (`getVariableDeclaration`), not a descendant walk.
import type { JsxAttribute, JsxOpeningElement, JsxSelfClosingElement, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import { unwrapExpression } from "./ast-read.ts";

export const QUERY_BOUNDARY = "QueryBoundary";
export const SKELETON_ROWS = "SkeletonRows";
export const RESERVE_KEY = "reserveKey";
/** The seam every finding points at — the tripwire's subject. */
export const QUERY_BOUNDARY_HOME = "packages/client/src/components/query-boundary.tsx";

export function jsxAttributeNamed(element: JsxOpeningElement | JsxSelfClosingElement, name: string): JsxAttribute | undefined {
  const attribute = element.getAttribute(name);
  return attribute !== undefined && Node.isJsxAttribute(attribute) ? attribute : undefined;
}

/** The fallback attribute's DIRECT `<SkeletonRows …/>` element, or undefined — a skeleton behind a wrapper
 *  element or component is out of reach (the declared limit). */
export function skeletonFallback(element: JsxOpeningElement): JsxSelfClosingElement | undefined {
  const initializer = jsxAttributeNamed(element, "fallback")?.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return;
  }
  const expression = initializer.getExpression();
  const unwrapped = expression === undefined ? undefined : unwrapExpression(expression);
  return unwrapped !== undefined && Node.isJsxSelfClosingElement(unwrapped) && unwrapped.getTagNameNode().getText() === SKELETON_ROWS ? unwrapped : undefined;
}

/** Is the skeleton's `count` STATIC — a numeric literal, or an identifier bound to a same-file variable
 *  whose initializer is one (the trivial dodge)? Anything else is dynamic: the caller owns the number. */
export function hasStaticCount(skeleton: JsxSelfClosingElement, sourceFile: SourceFile): boolean {
  const initializer = jsxAttributeNamed(skeleton, "count")?.getInitializer();
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return false;
  }
  const expression = initializer.getExpression();
  if (expression === undefined) {
    return false;
  }
  const unwrapped = unwrapExpression(expression);
  if (Node.isNumericLiteral(unwrapped)) {
    return true;
  }
  if (!Node.isIdentifier(unwrapped)) {
    return false;
  }
  const declared = sourceFile.getVariableDeclaration(unwrapped.getText())?.getInitializer();
  return declared !== undefined && Node.isNumericLiteral(unwrapExpression(declared));
}
