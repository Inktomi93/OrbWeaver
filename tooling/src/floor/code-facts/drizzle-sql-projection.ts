// Projected fields retain native authored source identity; labels alone never supply origin or authorization.
import { sql } from "drizzle-orm";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { readDrizzleSelection } from "./drizzle-select.ts";
import type { SqlFragmentsReader, SqlReadContext, SqlSelectContainment } from "./drizzle-sql-contract.ts";
import { runtimeDrizzleOrigin, sqlDialect } from "./drizzle-sql-native.ts";
import { columnType, nativeTableFragment, readSqlValueSources } from "./drizzle-sql-origin.ts";
import { staticMemberAccess } from "./reference-fact.ts";
import type { ReturnedValueSource } from "./reference-fact-contract.ts";
import { readSchemaObjectMembers } from "./schema-object.ts";

function projectedFragments(
  source: ReturnedValueSource,
  node: MorphNode,
  fragments: SqlFragmentsReader,
  contained: SqlSelectContainment,
): readonly (string | undefined)[] | undefined {
  const member = staticMemberAccess(node);
  if (member === undefined) {
    return;
  }
  const selection = readDrizzleSelection(source.value);
  if (selection === undefined || !contained(source.value, source.bindings)) {
    return;
  }
  if (selection.projection === undefined) {
    return columnType(node) && selection.source !== undefined && nativeTableFragment(selection.source, source.bindings, new Set()) !== undefined
      ? [sqlDialect.sqlToQuery(sql`${sql.identifier(member.name)}`).sql]
      : undefined;
  }
  const fields = readSchemaObjectMembers(selection.projection);
  const field = fields.kind === "resolved" ? fields.value.entries.findLast((candidate) => candidate.name === member.name) : undefined;
  return field === undefined ? undefined : fragments(field.value, source.bindings);
}

/** Actual native table or projected source, retaining every supplied helper-return alternative. */
export function readNativeColumnFragments(
  node: MorphNode,
  context: SqlReadContext,
  fragments: SqlFragmentsReader,
  contained: SqlSelectContainment,
): readonly (string | undefined)[] | undefined {
  const member = staticMemberAccess(node);
  if (member === undefined) {
    return;
  }
  const table = nativeTableFragment(member.receiver, context.bindings, new Set());
  if (columnType(node) && table !== undefined) {
    return [sqlDialect.sqlToQuery(sql`${sql.raw(table)}.${sql.identifier(member.name)}`).sql];
  }
  const selected = readSelectedSqlSource(member.receiver, context);
  if (selected === undefined || selected.length === 0) {
    return;
  }
  const alternatives = selected.map((source) => projectedFragments(source, node, fragments, contained));
  return alternatives.some((part) => part === undefined) ? undefined : alternatives.flatMap((part) => part ?? []);
}

function selectedQueries(source: ReturnedValueSource, context: SqlReadContext): readonly ReturnedValueSource[] | undefined {
  const value = source.value;
  const as = Node.isCallExpression(value) ? staticMemberAccess(value.getExpression()) : undefined;
  if (!source.present || source.path.length > 0 || !Node.isCallExpression(value) || as?.name !== "as" || !runtimeDrizzleOrigin(value.getExpression())) {
    return;
  }
  const cte = Node.isCallExpression(as.receiver) && staticMemberAccess(as.receiver.getExpression())?.name === "$with";
  const query = cte ? value.getArguments()[0] : as.receiver;
  if (query === undefined) {
    return;
  }
  const queries = readSqlValueSources(query, { ...context, bindings: source.bindings });
  return queries.kind === "resolved" &&
    queries.value.every((candidate) => candidate.present && candidate.path.length === 0 && readDrizzleSelection(candidate.value) !== undefined)
    ? queries.value
    : undefined;
}

/** The native select actually supplied to an installed subquery or CTE constructor, through the same value home. */
export function readSelectedSqlSource(node: MorphNode, context: SqlReadContext): readonly ReturnedValueSource[] | undefined {
  const sources = readSqlValueSources(node, context);
  if (sources.kind === "unresolved" || sources.value.length === 0) {
    return;
  }
  const selected = sources.value.map((source) => selectedQueries(source, context));
  return selected.some((part) => part === undefined) ? undefined : selected.flatMap((part) => part ?? []);
}
