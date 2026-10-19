// Native relational callbacks receive the catalog's actual columns and the installed operator record.
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { callsDrizzleOperator, relationalWhereCallback } from "./drizzle-operators.ts";
import { readRelationalConfigProperty } from "./drizzle-query.ts";
import type { ReadAnchor } from "./drizzle-query-contract.ts";
import { runtimeDrizzleOrigin } from "./drizzle-sql-native.ts";
import { columnType } from "./drizzle-sql-origin.ts";
import { CONTAINED_OPERATORS, sqlCarrierUseStable } from "./drizzle-sql-stability.ts";
import { DRIZZLE_WHERE_VERB } from "./drizzle-vocabulary.ts";
import { declaredInDrizzle, readCalledMember } from "./drizzle-write-chain.ts";
import { unwrapExpression } from "./expression-value.ts";
import { inspectReferenceWrites, staticMemberAccess } from "./reference-fact.ts";
import { lexicalReferenceSymbol } from "./reference-fact-alias.ts";
import type { CallReturnProgram } from "./reference-fact-contract.ts";
import { unprovenReferenceUse } from "./reference-fact-writes.ts";
import type { SchemaIdentityTable } from "./schema-identity-contract.ts";
import { readSchemaObjectMembers } from "./schema-object.ts";

function operatorsStable(callback: import("ts-morph").ArrowFunction | import("ts-morph").FunctionExpression): boolean {
  const parameter = callback.getParameters()[1];
  if (parameter === undefined) {
    return true;
  }
  const pattern = parameter.getNameNode();
  if (parameter.isRestParameter() || parameter.getInitializer() !== undefined || !Node.isObjectBindingPattern(pattern)) {
    return false;
  }
  return pattern.getElements().every((binding) => {
    const name = binding.getNameNode();
    const key = binding.getPropertyNameNode()?.getText() ?? binding.getName();
    return (
      Node.isIdentifier(name) &&
      binding.getInitializer() === undefined &&
      binding.getDotDotDotToken() === undefined &&
      inspectReferenceWrites(name).kind === "resolved" &&
      unprovenReferenceUse(name, (use, currentBinding) => {
        // Native property-reference groups also include distinct callbacks destructuring the same operator key.
        const actual = Node.isIdentifier(use) ? lexicalReferenceSymbol(use) : undefined;
        const current = lexicalReferenceSymbol(currentBinding);
        if (
          actual !== undefined &&
          current !== undefined &&
          actual.compilerSymbol !== current.compilerSymbol &&
          actual.getDeclarations().length === 1 &&
          current.getDeclarations().length === 1 &&
          actual.getDeclarations().every(Node.isBindingElement) &&
          current.getDeclarations().every(Node.isBindingElement)
        ) {
          return true;
        }
        const call = use.getParent();
        return (
          Node.isCallExpression(call) &&
          call.getExpression() === use &&
          CONTAINED_OPERATORS.some((operator) => operator === key) &&
          callsDrizzleOperator(call, key)
        );
      }) === undefined
    );
  });
}

/** An annotation cannot supply callback provenance: the native call and exact catalog table are required. */
export function readRelationalPredicateBindings(
  anchor: Extract<ReadAnchor, { readonly kind: "relational" }>,
  tables: readonly SchemaIdentityTable[],
  program: CallReturnProgram,
): ReadonlyMap<MorphNode, MorphNode> | undefined {
  const member = readCalledMember(anchor.call);
  const callback = anchor.config === undefined ? undefined : readRelationalConfigProperty(unwrapExpression(anchor.config), DRIZZLE_WHERE_VERB);
  const selected = tables.filter((candidate) => candidate.identity.declarationName === anchor.table.getText());
  const table = selected[0];
  if (
    member.kind !== "resolved" ||
    member.value.declarations.length === 0 ||
    !declaredInDrizzle(member.value.declarations) ||
    !runtimeDrizzleOrigin(anchor.call.getExpression()) ||
    !(Node.isArrowFunction(callback) || Node.isFunctionExpression(callback)) ||
    callback.isAsync() ||
    !relationalWhereCallback(callback) ||
    selected.length !== 1 ||
    table === undefined
  ) {
    return;
  }
  const parameter = callback.getParameters()[0];
  const name = parameter?.getNameNode();
  const columns = table.call.getArguments()[1];
  const fields = columns === undefined ? undefined : readSchemaObjectMembers(columns);
  if (
    parameter === undefined ||
    !Node.isIdentifier(name) ||
    parameter.isRestParameter() ||
    parameter.getInitializer() !== undefined ||
    fields?.kind !== "resolved" ||
    inspectReferenceWrites(name).kind !== "resolved" ||
    !operatorsStable(callback)
  ) {
    return;
  }
  const names = new Set(fields.value.entries.map((field) => field.name));
  const escaped = unprovenReferenceUse(name, (use) => {
    const access = use.getParentOrThrow();
    const read = staticMemberAccess(access);
    return read?.receiver === use && names.has(read.name) && columnType(access) && sqlCarrierUseStable(access, program);
  });
  return escaped === undefined ? new Map([[parameter, table.declaration.getNameNode()]]) : undefined;
}
