// Mutable native SQL and subquery carriers require a closed set of read-only local composition uses.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readObservedCallableConsumers } from "./call-returns.ts";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { readDrizzleSelection, readFollowingSelectChain } from "./drizzle-select.ts";
import { AGGREGATE_OPERATORS, runtimeDrizzleOrigin } from "./drizzle-sql-native.ts";
import { columnType, readSqlValueSources, sqlMethod, sqlValue } from "./drizzle-sql-origin.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { enclosingFn } from "./function-context.ts";
import { inspectReferenceWrites, resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import type { CallReturnProgram } from "./reference-fact-contract.ts";
import { unprovenReferenceUse } from "./reference-fact-writes.ts";
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
  "exists",
  "notExists",
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
function executedSelectionCall(call: import("ts-morph").CallExpression): boolean {
  const member = readCalledMember(call);
  return (
    member.kind === "resolved" &&
    ["all", "get", "run", "execute"].includes(member.value.name) &&
    member.value.declarations.length > 0 &&
    declaredInDrizzle(member.value.declarations)
  );
}

/** Native thenable classification is not SELECT origin; consumers must separately prove the builder's source. */
export function nativeQueryThenable(node: MorphNode): boolean {
  const declarations = node.getType().getProperty("then")?.getDeclarations() ?? [];
  return declarations.length > 0 && declaredInDrizzle(declarations);
}
function awaitedSelection(value: MorphNode, program?: CallReturnProgram): boolean {
  const sources = readSqlValueSources(value, { bindings: new Map(), program });
  return (
    sources.kind === "resolved" &&
    sources.value.length > 0 &&
    sources.value.every((source) => {
      const selection = readDrizzleSelection(source.value);
      if (
        !source.present ||
        source.path.length > 0 ||
        selection === undefined ||
        !selection.calls.every((call) => runtimeDrizzleOrigin(call.getExpression()))
      ) {
        return false;
      }
      return selection.calls.some(executedSelectionCall) || nativeQueryThenable(source.value);
    })
  );
}
function nativeSelectionUse(call: import("ts-morph").CallExpression, active: ReadonlySet<object>, program?: CallReturnProgram): boolean {
  // Standalone origin reads do not supply callable consumers; whole-statement lifetime needs the captured graph.
  if (program === undefined) {
    return true;
  }
  const chain = readFollowingSelectChain(call);
  if ([call, ...chain.calls].some(executedSelectionCall)) {
    return true;
  }
  if (Node.isAwaitExpression(chain.top)) {
    return awaitedSelection(chain.top.getExpression(), program);
  }
  const discarded = Node.isExpressionStatement(chain.top.getParent()) && [call, ...chain.calls].every((step) => runtimeDrizzleOrigin(step.getExpression()));
  return discarded || sqlAliasUseStable(chain.top, active, program);
}
function nativeProjectionUse(property: import("ts-morph").PropertyAssignment, active: ReadonlySet<object>, program?: CallReturnProgram): boolean | undefined {
  const object = property.getParent();
  const call = object.getParent();
  const member = Node.isCallExpression(call) ? staticMemberAccess(call.getExpression()) : undefined;
  if (
    !(
      Node.isObjectLiteralExpression(object) &&
      Node.isCallExpression(call) &&
      call.getArguments()[0] === object &&
      ["select", "selectDistinct"].includes(member?.name ?? "") &&
      runtimeDrizzleOrigin(call.getExpression())
    )
  ) {
    return;
  }
  return nativeSelectionUse(call, active, program);
}
function authoredArgumentUse(
  value: MorphNode,
  call: import("ts-morph").CallExpression,
  active: ReadonlySet<object>,
  program?: CallReturnProgram,
): boolean | undefined {
  const authored = program?.byCall.get(call.compilerNode);
  if (authored?.target.kind === "resolved" && !authored.target.value.getSourceFile().isDeclarationFile()) {
    const target = authored.target.value;
    const position = call.getArguments().findIndex((argument) => argument.compilerNode === value.compilerNode);
    const parameter =
      Node.isFunctionDeclaration(target) || Node.isArrowFunction(target) || Node.isFunctionExpression(target) || Node.isMethodDeclaration(target)
        ? target.getParameters()[position]
        : undefined;
    return parameter !== undefined && sqlBindingStable(parameter.getNameNode(), active, program);
  }
  return undefined;
}
function nativeSqlCallUse(value: MorphNode, call: import("ts-morph").CallExpression, active: ReadonlySet<object>, program?: CallReturnProgram): boolean {
  if (CONTAINED_OPERATORS.some((name) => callsDrizzleOperator(call, name))) {
    return runtimeDrizzleOrigin(call.getExpression()) && sqlAliasUseStable(call, active, program);
  }
  const constructs =
    ["join", "identifier", "raw"].some((name) => sqlMethod(call, name)) ||
    (Object.keys(AGGREGATE_OPERATORS).some((name) => callsDrizzleOperator(call, name)) && runtimeDrizzleOrigin(call.getExpression()));
  if (constructs) {
    return sqlAliasUseStable(call, active, program);
  }
  const authored = authoredArgumentUse(value, call, active, program);
  if (authored !== undefined) {
    return authored;
  }
  const member = readCalledMember(call);
  if (member.kind !== "resolved" || member.value.declarations.length === 0 || !declaredInDrizzle(member.value.declarations)) {
    return false;
  }
  const select = readDrizzleSelection(call);
  if (select !== undefined && select.calls.every((native) => runtimeDrizzleOrigin(native.getExpression()))) {
    return nativeSelectionUse(call, active, program);
  }
  // Native SQL-returning calls can retain physical chunks; their result is a containing carrier, not a terminal.
  return sqlValue(call.getType()) || nativeQueryThenable(call) ? sqlAliasUseStable(call, active, program) : true;
}
function nativeSqlMemberUse(parent: MorphNode, value: MorphNode, active: ReadonlySet<object>, program?: CallReturnProgram): boolean {
  const member = staticMemberAccess(parent);
  if (member?.receiver !== value) {
    return false;
  }
  if (member.name !== "_" && (columnType(parent) || sqlValue(parent.getType()))) {
    return sqlAliasUseStable(parent, active, program);
  }
  const call = parent.getParent();
  return (
    ["as", "getSQL"].includes(member.name) &&
    Node.isCallExpression(call) &&
    runtimeDrizzleOrigin(call.getExpression()) &&
    sqlAliasUseStable(call, active, program)
  );
}
function nativeSqlTemplateUse(span: import("ts-morph").TemplateSpan, active: ReadonlySet<object>, program?: CallReturnProgram): boolean {
  const template = span.getParent().getParent();
  return (
    Node.isTaggedTemplateExpression(template) &&
    drizzleExportOf(template.getTag()) === "sql" &&
    runtimeDrizzleOrigin(template.getTag()) &&
    sqlAliasUseStable(template, active, program)
  );
}
function returnedSqlUse(owner: MorphNode, active: ReadonlySet<object>, program?: CallReturnProgram): boolean {
  if (program === undefined) {
    return false;
  }
  const consumers = readObservedCallableConsumers(owner, program);
  return consumers.kind === "resolved" && consumers.value.every((consumer) => sqlAliasUseStable(consumer.call, active, program));
}
function returnedSqlOwner(value: MorphNode): MorphNode | undefined {
  const owner = enclosingFn(value);
  const parent = value.getParent();
  return owner !== undefined && (Node.isReturnStatement(parent) || parent === owner) ? owner : undefined;
}
function sqlAliasUseStable(use: MorphNode, active: ReadonlySet<object>, program?: CallReturnProgram): boolean {
  if (active.has(use.compilerNode)) {
    return false;
  }
  return sqlContainingUse(transparentSqlUse(use), new Set(active).add(use.compilerNode), program);
}
function sqlStoredBinding(value: MorphNode): MorphNode | undefined {
  const parent = value.getParent();
  return Node.isVariableDeclaration(parent) && parent.getInitializer() === value ? parent.getNameNode() : undefined;
}
function sqlContainingUse(value: MorphNode, active: ReadonlySet<object>, program?: CallReturnProgram): boolean {
  const parent = value.getParent();
  const binding = sqlStoredBinding(value);
  if (binding !== undefined) {
    return sqlBindingStable(binding, active, program);
  }
  if (Node.isArrayLiteralExpression(parent) && parent.getElements().some((element) => element.compilerNode === value.compilerNode)) {
    return sqlAliasUseStable(parent, active, program);
  }
  if (Node.isPropertyAssignment(parent) && parent.getInitializer() === value) {
    return nativeProjectionUse(parent, active, program) ?? sqlAliasUseStable(parent.getParent(), active, program);
  }
  const returnedOwner = returnedSqlOwner(value);
  if (returnedOwner !== undefined) {
    return returnedSqlUse(returnedOwner, active, program);
  }
  if (identityObservation(parent)) {
    return true;
  }
  if (Node.isAwaitExpression(parent)) {
    return awaitedSelection(value, program) || sqlAliasUseStable(parent, active, program);
  }
  if (Node.isTemplateSpan(parent) && parent.getExpression() === value) {
    return nativeSqlTemplateUse(parent, active, program);
  }
  if (Node.isCallExpression(parent) && parent.getArguments().some((argument) => argument.compilerNode === value.compilerNode)) {
    return nativeSqlCallUse(value, parent, active, program);
  }
  return parent !== undefined && nativeSqlMemberUse(parent, value, active, program);
}

/** Inline statement carriers and bound SQL share the same physical containing-use obligation. */
export function sqlCarrierUseStable(node: MorphNode, program?: CallReturnProgram): boolean {
  return sqlAliasUseStable(node, new Set(), program);
}

function sqlBindingDeclaration(node: MorphNode): MorphNode | undefined {
  const symbol = node.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  const local = symbol?.getValueDeclaration() ?? (declarations.length === 1 ? declarations[0] : undefined);
  if (!(Node.isImportSpecifier(local) || Node.isImportClause(local))) {
    return local;
  }
  const module = resolveModuleMemberOrigin(node);
  return module.kind === "resolved" && module.value.canonical.kind === "project" ? module.value.canonical.declaration : undefined;
}

function stableSqlDeclaration(
  declaration: import("ts-morph").VariableDeclaration | import("ts-morph").ParameterDeclaration,
  program?: CallReturnProgram,
): boolean {
  if (Node.isParameterDeclaration(declaration)) {
    return program !== undefined && readObservedCallableConsumers(declaration.getParent(), program).kind === "resolved";
  }
  const stable = resolveStableExpression(declaration.getNameNode());
  return stable.kind === "resolved" || stable.reason === "dynamic";
}

/** Every loaded reference and containing native carrier must preserve this SQL object. */
export function sqlBindingStable(node: MorphNode, active: ReadonlySet<object>, program?: CallReturnProgram): boolean {
  if (!Node.isIdentifier(node)) {
    return false;
  }
  if (active.has(node.getSymbol()?.compilerSymbol ?? node.compilerNode)) {
    return false;
  }
  const declaration = sqlBindingDeclaration(node);
  if (!(Node.isVariableDeclaration(declaration) || Node.isParameterDeclaration(declaration))) {
    return false;
  }
  const name = declaration.getNameNode();
  if (!Node.isIdentifier(name) || inspectReferenceWrites(name).kind === "unresolved") {
    return false;
  }
  if (!stableSqlDeclaration(declaration, program)) {
    return false;
  }
  const next = new Set(active).add(node.getSymbol()?.compilerSymbol ?? node.compilerNode);
  return unprovenReferenceUse(name, (use) => sqlAliasUseStable(use, next, program)) === undefined;
}
