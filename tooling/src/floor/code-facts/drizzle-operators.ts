// Drizzle operator import and relational callback provenance, never authorization.

import type { CallExpression, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { staticMemberAccess } from "./reference-fact.ts";
export const RELATIONAL_WHERE = "where";
export const RELATIONAL_VERBS: ReadonlySet<string> = new Set(["findFirst", "findMany"]);

/** Is this call's callee the drizzle-orm export `name`, by its import (named or namespace), never its spelling,
 *  or the same operator a relational-API `where` callback destructures from drizzle's operator argument? */
export function callsDrizzleOperator(call: CallExpression, name: string): boolean {
  const callee = call.getExpression();
  return drizzleExportOf(callee) === name || relationalOperatorName(callee) === name;
}

/** The relational-API config object a `where` callback is the value of: `db.query.<t>.findFirst({ where })`. */
export function relationalWhereCallback(fn: Node): boolean {
  const property = fn.getParent();
  const config = property?.getParent();
  const call = config?.getParent();
  return (
    property?.isKind(SyntaxKind.PropertyAssignment) === true &&
    property.getName() === RELATIONAL_WHERE &&
    call?.isKind(SyntaxKind.CallExpression) === true &&
    call.getArguments()[0] === config &&
    RELATIONAL_VERBS.has(staticMemberAccess(call.getExpression())?.name ?? "")
  );
}

/** The drizzle operator `callee` names when a relational `where` callback destructures it from its second
 *  parameter (`where: (t, { eq }) => eq(t.ownerId, ownerId)`), or undefined. drizzle passes those operators in,
 *  so they carry no import. */
export function relationalOperatorName(callee: Node): string | undefined {
  if (!callee.isKind(SyntaxKind.Identifier)) {
    return;
  }
  const element = callee.getDefinitionNodes().find((definition) => definition.isKind(SyntaxKind.BindingElement));
  if (element === undefined || !element.isKind(SyntaxKind.BindingElement)) {
    return;
  }
  const parameter = element.getParent().getParent();
  if (!parameter.isKind(SyntaxKind.Parameter)) {
    return;
  }
  const fn = parameter.getParent();
  const isOperatorParameter = (fn.isKind(SyntaxKind.ArrowFunction) || fn.isKind(SyntaxKind.FunctionExpression)) && fn.getParameters()[1] === parameter;
  return isOperatorParameter && relationalWhereCallback(fn) ? (element.getPropertyNameNode()?.getText() ?? element.getName()) : undefined;
}
