// Runtime-source identity is required before a table, column, or mapped input contributes SQL grammar.
import { sql } from "drizzle-orm";
import type { Node as MorphNode, Type } from "ts-morph";
import { Node } from "ts-morph";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { readPredicateArgument } from "./drizzle-predicate-argument.ts";
import type { SqlReadContext } from "./drizzle-sql-contract.ts";
import { runtimeDrizzleOrigin, sqlDialect } from "./drizzle-sql-native.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { inspectReferenceWrites, staticMemberAccess } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { ReferenceFact, ReturnedValueSource } from "./reference-fact-contract.ts";
import { invokedMemberThroughAliases, unprovenReferenceUse } from "./reference-fact-writes.ts";
import { exactDrizzleExport, terminalCall } from "./schema-value.ts";
import { readStaticAuthoredScalar } from "./static-authored-value.ts";
import { resolveTypeIdentityChain } from "./type-member-origin.ts";
import { readAuthoredValueSources, readReturnedValue } from "./value-carrier.ts";
/** Primitive driver data cannot introduce SQL grammar. */
export function driverParameter(type: Type): boolean {
  if (type.isTuple()) {
    return type.getTupleElements().every(driverParameter);
  }
  if (type.isUnion()) {
    return type.getUnionTypes().every(driverParameter);
  }
  if (type.isIntersection()) {
    return type.getIntersectionTypes().some(driverParameter);
  }
  const element = type.getArrayElementType();
  return element === undefined
    ? type.isString() ||
        type.isStringLiteral() ||
        type.isTemplateLiteral() ||
        type.isNumber() ||
        type.isNumberLiteral() ||
        type.isBoolean() ||
        type.isBooleanLiteral() ||
        type.isNull() ||
        type.isUndefined() ||
        type.isBigInt() ||
        type.isBigIntLiteral()
    : driverParameter(element);
}

/** Declared native column type is a classifier, not runtime-source evidence. */
export function columnType(node: MorphNode): boolean {
  const identity = resolveTypeIdentityChain(node);
  return (
    identity.kind === "resolved" &&
    identity.value.some(
      (origin) =>
        (origin.name === "Column" || origin.name === "SQLiteColumn") &&
        origin.declarations.length > 0 &&
        origin.declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes("/drizzle-orm/")),
    )
  );
}

/** Native terminals stop only the existing value traversal; supplied/returned sources retain their actual bindings. */
export function readSqlValueSources(node: MorphNode, context: SqlReadContext): ReferenceFact<readonly ReturnedValueSource[]> {
  const terminals = (call: import("ts-morph").CallExpression): boolean => runtimeDrizzleOrigin(call.getExpression());
  return context.program === undefined
    ? readAuthoredValueSources(node, [], context.bindings, terminals)
    : readReturnedValue(node, [], { programs: [context.program] }, { terminals, bindings: context.bindings });
}

/** Actual native table/alias constructor with an authored SQL name. */
export function nativeTableFragment(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode>, active: ReadonlySet<object>): string | undefined {
  const source = readPredicateArgument(node, bindings);
  if (source.kind === "unresolved" || active.has(source.value.compilerNode)) {
    return;
  }
  const terminal = terminalCall(source.value);
  if (terminal.kind === "unresolved" || !runtimeDrizzleOrigin(terminal.value.getExpression())) {
    return;
  }
  const call = terminal.value;
  const args = call.getArguments();
  const isTable = exactDrizzleExport(call, "sqliteTable").kind === "resolved";
  const alias = ["alias", "aliasedTable"].some((exported) => callsDrizzleOperator(call, exported));
  if (!(isTable || alias)) {
    return;
  }
  const name = args[isTable ? 0 : 1];
  const scalar = name === undefined ? undefined : readStaticAuthoredScalar(name);
  if (scalar?.kind !== "resolved" || typeof scalar.value !== "string") {
    return;
  }
  const target = args[0];
  if (alias && (target === undefined || nativeTableFragment(target, bindings, new Set(active).add(source.value.compilerNode)) === undefined)) {
    return;
  }
  return sqlDialect.sqlToQuery(sql`${sql.identifier(scalar.value)}`).sql;
}

/** Classify mutable SQL carriers without granting containment or authorization. */
export function sqlValue(type: Type, active: ReadonlySet<object> = new Set()): boolean {
  if (active.has(type.compilerType)) {
    return false;
  }
  const next = new Set(active).add(type.compilerType);
  if (type.isUnion() || type.isIntersection()) {
    return [...type.getUnionTypes(), ...type.getIntersectionTypes()].some((member) => sqlValue(member, next));
  }
  const element = type.getArrayElementType();
  if (element !== undefined) {
    return sqlValue(element, next);
  }
  const symbol = type.getSymbol();
  const declarations = symbol?.getDeclarations() ?? [];
  return (
    ["SQL", "Aliased", "Subquery", "WithSubquery"].includes(symbol?.getName() ?? "") &&
    declarations.length > 0 &&
    declarations.every((declaration) => declaration.getSourceFile().getFilePath().includes("/drizzle-orm/"))
  );
}

/** An imported native sql member with the installed callable declaration. */
export function sqlMethod(call: import("ts-morph").CallExpression, name: string): boolean {
  const member = staticMemberAccess(call.getExpression());
  return member?.name === name && drizzleExportOf(member.receiver) === "sql" && runtimeDrizzleOrigin(call.getExpression());
}

/** Default-library map identity with no known receiver write or mutating invocation. */
export function nativeArrayMap(call: import("ts-morph").CallExpression): boolean {
  const member = staticMemberAccess(call.getExpression());
  const type = member?.receiver.getType();
  const declarations = type?.getProperty("map")?.getDeclarations() ?? [];
  const receiver = member?.receiver;
  const stable =
    !Node.isIdentifier(receiver) || (inspectReferenceWrites(receiver).kind === "resolved" && invokedMemberThroughAliases(receiver, new Map()) === undefined);
  return (
    stable &&
    member?.name === "map" &&
    (type?.isArray() === true || type?.isReadonlyArray() === true || type?.isTuple() === true) &&
    declarations.length > 0 &&
    declarations.every((declaration) =>
      declaration.getProject().getProgram().compilerObject.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode),
    )
  );
}

function mappedBindingStable(node: import("ts-morph").Identifier, declaration: MorphNode | undefined): boolean {
  const name = Node.isVariableDeclaration(declaration) || Node.isParameterDeclaration(declaration) ? declaration.getNameNode() : node;
  if (
    !Node.isIdentifier(name) ||
    inspectReferenceWrites(node).kind === "unresolved" ||
    invokedMemberThroughAliases(node, new Map()) !== undefined ||
    unprovenReferenceUse(name, new Set([node])) !== undefined
  ) {
    return false;
  }
  return true;
}

/** Actual supplied native-array origin with closed loaded-project uses. */
export function nativeMappedInput(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode>, active = new Set<object>()): boolean {
  if (active.has(node.compilerNode)) {
    return false;
  }
  const next = new Set(active).add(node.compilerNode);
  const unwrapped = unwrapTarget(node);
  if (unwrapped !== node) {
    return nativeMappedInput(unwrapped, bindings, next);
  }
  if (Node.isIdentifier(node)) {
    const declaration = node.getSymbol()?.getValueDeclaration();
    if (!mappedBindingStable(node, declaration)) {
      return false;
    }
    const supplied = declaration === undefined ? undefined : bindings.get(declaration);
    if (supplied !== undefined) {
      return nativeMappedInput(supplied, bindings, next);
    }
    const source = readPredicateArgument(node, bindings);
    return source.kind === "resolved" && source.value !== node && nativeMappedInput(source.value, bindings, next);
  }
  if (Node.isArrayLiteralExpression(node)) {
    return node.getElements().every((element) => driverParameter(element.getType()) || Node.isObjectLiteralExpression(element));
  }
  if (!Node.isCallExpression(node)) {
    return false;
  }
  const member = staticMemberAccess(node.getExpression());
  const declarations = member?.receiver.getType().getProperty("filter")?.getDeclarations() ?? [];
  return (
    member?.name === "filter" &&
    declarations.length > 0 &&
    declarations.every((declaration) =>
      declaration.getProject().getProgram().compilerObject.isSourceFileDefaultLibrary(declaration.getSourceFile().compilerNode),
    ) &&
    nativeMappedCallback(node.getArguments()[0]) &&
    nativeMappedInput(member.receiver, bindings, next)
  );
}

/** Array access through the third callback argument is not a read-only input proof. */
export function nativeMappedCallback(node: MorphNode | undefined): boolean {
  return (
    (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) &&
    node.getParameters().length <= 2 &&
    node.getParameters().every((parameter) => !parameter.isRestParameter())
  );
}
