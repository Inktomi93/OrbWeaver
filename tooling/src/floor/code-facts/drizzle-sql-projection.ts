// Projected fields retain native authored source identity; labels alone never supply origin or authorization.
import { sql } from "drizzle-orm";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readPredicateArgument } from "./drizzle-predicate-argument.ts";
import { readDrizzleSelection } from "./drizzle-select.ts";
import type { SqlFragmentsReader, SqlSelectContainment } from "./drizzle-sql-contract.ts";
import { runtimeDrizzleOrigin, sqlDialect } from "./drizzle-sql-native.ts";
import { columnType, nativeTableFragment } from "./drizzle-sql-origin.ts";
import { staticMemberAccess } from "./reference-fact.ts";
import { readSchemaObjectMembers } from "./schema-object.ts";
import { terminalCall } from "./schema-value.ts";
/** Actual native table or projected-column source, never a declared column type alone. */
export function readNativeColumnFragments(
  node: MorphNode,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  sqlOperandFragments: SqlFragmentsReader,
  selectContained: SqlSelectContainment,
): readonly (string | undefined)[] | undefined {
  const member = staticMemberAccess(node);
  if (member === undefined) {
    return;
  }
  const table = nativeTableFragment(member.receiver, bindings, new Set());
  if (columnType(node) && table !== undefined) {
    return [sqlDialect.sqlToQuery(sql`${sql.raw(table)}.${sql.identifier(member.name)}`).sql];
  }
  const selected = readSelectedSqlSource(member.receiver, bindings);
  const selection = selected === undefined ? undefined : readDrizzleSelection(selected);
  if (selected === undefined || selection === undefined || !selectContained(selected)) {
    return;
  }
  if (selection.projection === undefined) {
    return columnType(node) && selection.source !== undefined && nativeTableFragment(selection.source, bindings, new Set()) !== undefined
      ? [sqlDialect.sqlToQuery(sql`${sql.identifier(member.name)}`).sql]
      : undefined;
  }
  const fields = readSchemaObjectMembers(selection.projection);
  const field = fields.kind === "resolved" ? fields.value.entries.findLast((candidate) => candidate.name === member.name) : undefined;
  return field === undefined ? undefined : sqlOperandFragments(field.value);
}

/** The native select actually supplied to an installed subquery or CTE constructor. */
export function readSelectedSqlSource(node: MorphNode, bindings: ReadonlyMap<MorphNode, MorphNode>): MorphNode | undefined {
  const source = readPredicateArgument(node, bindings);
  const terminal = source.kind === "resolved" ? terminalCall(source.value) : undefined;
  if (terminal?.kind !== "resolved" || !runtimeDrizzleOrigin(terminal.value.getExpression())) {
    return;
  }
  const as = staticMemberAccess(terminal.value.getExpression());
  if (as?.name !== "as") {
    return;
  }
  const cte = Node.isCallExpression(as.receiver) && staticMemberAccess(as.receiver.getExpression())?.name === "$with";
  const selected = cte ? terminal.value.getArguments()[0] : as.receiver;
  return selected !== undefined && readDrizzleSelection(selected) !== undefined ? selected : undefined;
}
