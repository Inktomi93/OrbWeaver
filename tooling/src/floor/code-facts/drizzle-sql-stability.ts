// Mutable native SQL and subquery carriers require a closed set of read-only local composition uses.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { AGGREGATE_OPERATORS, runtimeDrizzleOrigin } from "./drizzle-sql-native.ts";
import { columnType, sqlMethod, sqlValue } from "./drizzle-sql-origin.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { enclosingFn } from "./function-context.ts";
import { inspectReferenceWrites, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { unprovenReferenceUse } from "./reference-fact-writes.ts";
import { referencesOf } from "./value-carrier.ts";
export const CONTAINED_OPERATORS = [
  "and",
  "or",
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "isNull",
  "isNotNull",
  "inArray",
  "notInArray",
  "like",
  "notLike",
  "ilike",
  "notIlike",
  "not",
  "asc",
  "desc",
] as const;

function identityObservation(node: MorphNode | undefined): boolean {
  return (
    Node.isBinaryExpression(node) && [SyntaxKind.EqualsEqualsEqualsToken, SyntaxKind.ExclamationEqualsEqualsToken].includes(node.getOperatorToken().getKind())
  );
}

function transparentSqlUse(use: MorphNode): MorphNode {
  let value = use;
  for (let parent = value.getParent(); parent !== undefined && transparentSqlParent(parent, value); parent = value.getParent()) {
    value = parent;
  }
  return value;
}
function transparentSqlParent(parent: MorphNode, value: MorphNode): boolean {
  return (
    Node.isParenthesizedExpression(parent) ||
    Node.isNonNullExpression(parent) ||
    Node.isAsExpression(parent) ||
    Node.isSatisfiesExpression(parent) ||
    (Node.isConditionalExpression(parent) && parent.getCondition() !== value)
  );
}
function nativeProjectionUse(property: import("ts-morph").PropertyAssignment): boolean {
  const object = property.getParent();
  const call = object.getParent();
  const member = Node.isCallExpression(call) ? staticMemberAccess(call.getExpression()) : undefined;
  return (
    Node.isObjectLiteralExpression(object) &&
    Node.isCallExpression(call) &&
    call.getArguments()[0] === object &&
    ["select", "selectDistinct"].includes(member?.name ?? "") &&
    runtimeDrizzleOrigin(call.getExpression())
  );
}
function nativeSqlCallUse(call: import("ts-morph").CallExpression, active: ReadonlySet<object>): boolean {
  if (CONTAINED_OPERATORS.some((name) => callsDrizzleOperator(call, name))) {
    return runtimeDrizzleOrigin(call.getExpression()) && sqlAliasUseStable(call, active);
  }
  const constructs =
    ["join", "identifier", "raw"].some((name) => sqlMethod(call, name)) ||
    (Object.keys(AGGREGATE_OPERATORS).some((name) => callsDrizzleOperator(call, name)) && runtimeDrizzleOrigin(call.getExpression()));
  if (constructs) {
    return sqlAliasUseStable(call, active);
  }
  const member = readCalledMember(call);
  if (member.kind !== "resolved" || member.value.declarations.length === 0 || !declaredInDrizzle(member.value.declarations)) {
    return false;
  }
  // Native SQL-returning calls can retain physical chunks; their result is a containing carrier, not a terminal.
  return sqlValue(call.getType()) ? sqlAliasUseStable(call, active) : true;
}
function nativeSqlMemberUse(parent: MorphNode, value: MorphNode, active: ReadonlySet<object>): boolean {
  const member = staticMemberAccess(parent);
  if (member?.receiver !== value) {
    return false;
  }
  if (member.name !== "_" && (columnType(parent) || sqlValue(parent.getType()))) {
    return sqlAliasUseStable(parent, active);
  }
  const call = parent.getParent();
  return member.name === "as" && Node.isCallExpression(call) && runtimeDrizzleOrigin(call.getExpression()) && sqlAliasUseStable(call, active);
}
function nativeSqlTemplateUse(span: import("ts-morph").TemplateSpan, active: ReadonlySet<object>): boolean {
  const template = span.getParent().getParent();
  return (
    Node.isTaggedTemplateExpression(template) &&
    drizzleExportOf(template.getTag()) === "sql" &&
    runtimeDrizzleOrigin(template.getTag()) &&
    sqlAliasUseStable(template, active)
  );
}
function sqlAliasUseStable(use: MorphNode, active: ReadonlySet<object>): boolean {
  const value = transparentSqlUse(use);
  const parent = value.getParent();
  if (Node.isVariableDeclaration(parent) && parent.getInitializer() === value && Node.isIdentifier(parent.getNameNode())) {
    return sqlBindingStable(parent.getNameNode(), active);
  }
  if (Node.isArrayLiteralExpression(parent) && parent.getElements().some((element) => element.compilerNode === value.compilerNode)) {
    return sqlAliasUseStable(parent, active);
  }
  if (Node.isPropertyAssignment(parent) && parent.getInitializer() === value) {
    return nativeProjectionUse(parent);
  }
  if (identityObservation(parent)) {
    return true;
  }
  if (Node.isTemplateSpan(parent) && parent.getExpression() === value) {
    return nativeSqlTemplateUse(parent, active);
  }
  if (Node.isCallExpression(parent) && parent.getArguments().some((argument) => argument.compilerNode === value.compilerNode)) {
    return nativeSqlCallUse(parent, active);
  }
  return parent !== undefined && nativeSqlMemberUse(parent, value, active);
}

/** Every loaded reference and containing native carrier must preserve this SQL object. */
export function sqlBindingStable(node: MorphNode, active: ReadonlySet<object>): boolean {
  if (!Node.isIdentifier(node)) {
    return false;
  }
  if (active.has(node.getSymbol()?.compilerSymbol ?? node.compilerNode)) {
    return false;
  }
  const declaration = node.getSymbol()?.getValueDeclaration();
  if (!Node.isVariableDeclaration(declaration)) {
    return false;
  }
  const name = declaration.getNameNode();
  if (!Node.isIdentifier(name) || inspectReferenceWrites(name).kind === "unresolved") {
    return false;
  }
  const stable = resolveStableExpression(name);
  if (stable.kind === "unresolved" && stable.reason !== "dynamic") {
    return false;
  }
  const next = new Set(active).add(node.getSymbol()?.compilerSymbol ?? node.compilerNode);
  const uses = referencesOf(name, enclosingFn(name) ?? name.getSourceFile());
  return uses.every((use) => sqlAliasUseStable(use, next)) && unprovenReferenceUse(name, new Set(uses)) === undefined;
}
