// Native constructor emission consumes the one lexical reader; it never acquires a helper call graph.
import { count, sql } from "drizzle-orm";
import type { CallExpression, Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { readPredicateArgument } from "./drizzle-predicate-argument.ts";
import type { SqlFragmentsReader } from "./drizzle-sql-contract.ts";
import { AGGREGATE_OPERATORS, runtimeDrizzleOrigin, sqlDialect } from "./drizzle-sql-native.ts";
import { sqlMethod, sqlValue } from "./drizzle-sql-origin.ts";
import { sqlBindingStable } from "./drizzle-sql-stability.ts";
import { DRIZZLE_ALIAS_VERB, DRIZZLE_SQL_RAW_MEMBER } from "./drizzle-vocabulary.ts";
import { staticMemberAccess } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import { unprovenReferenceUse } from "./reference-fact-writes.ts";
import { sqliteFragmentContained } from "./sqlite-lexical.ts";
import { readStaticAuthoredScalar } from "./static-authored-value.ts";

function identifierFragments(call: CallExpression, bindings: ReadonlyMap<MorphNode, MorphNode>): readonly string[] | undefined {
  const args = call.getArguments();
  const value = args[0] === undefined ? undefined : readPredicateArgument(args[0], bindings);
  return args.length === 1 && value?.kind === "resolved" && (value.value.getType().isString() || value.value.getType().isStringLiteral())
    ? [sqlDialect.sqlToQuery(sql`${sql.identifier("identifier")}`).sql]
    : undefined;
}
function rawFragments(call: CallExpression): readonly string[] | undefined {
  const args = call.getArguments();
  const literal = args[0] === undefined ? undefined : readStaticAuthoredScalar(args[0]);
  return args.length === 1 && literal?.kind === "resolved" && typeof literal.value === "string" ? [literal.value] : undefined;
}
function finiteJoinedInputStable(input: MorphNode | undefined): boolean {
  const value = input === undefined ? undefined : unwrapTarget(input);
  if (!Node.isIdentifier(value)) {
    return true;
  }
  // A closed physical carrier can still receive chunks; finite emission additionally requires unchanged array contents.
  return (
    unprovenReferenceUse(value, (use) => {
      const call = use.getParent();
      return Node.isCallExpression(call) && call.getArguments()[0] === use && sqlMethod(call, "join");
    }) === undefined
  );
}
function joinedFragments(
  call: CallExpression,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  sqlOperandFragments: SqlFragmentsReader,
  mappedFragments: SqlFragmentsReader,
): readonly string[] | undefined {
  const args = call.getArguments();
  const input = args[0];
  if (Node.isIdentifier(input) && !sqlBindingStable(input, new Set())) {
    return;
  }
  const separator = args[1] === undefined ? [""] : sqlOperandFragments(args[1]);
  const mapped = input === undefined ? undefined : mappedFragments(input);
  // Every element is a native driver parameter. Comma separation cannot change lexical state at any cardinality.
  if (
    mapped !== undefined &&
    mapped.every((fragment) => fragment !== undefined && /^\s*\?\s*$/u.test(fragment)) &&
    separator?.every((fragment) => fragment !== undefined && /^\s*,\s*$/u.test(fragment)) === true
  ) {
    return ["", "?"];
  }
  const source = input === undefined ? undefined : readPredicateArgument(input, bindings);
  if (source?.kind !== "resolved" || !Node.isArrayLiteralExpression(source.value) || separator === undefined || !finiteJoinedInputStable(input)) {
    return;
  }
  return finiteJoinedFragments(source.value, separator, sqlOperandFragments);
}
function finiteJoinedFragments(
  source: import("ts-morph").ArrayLiteralExpression,
  separator: readonly (string | undefined)[],
  sqlOperandFragments: SqlFragmentsReader,
): readonly string[] | undefined {
  let variants: readonly string[][] = [[]];
  for (const item of source.getElements()) {
    const fragments = sqlOperandFragments(item);
    if (fragments === undefined || fragments.some((fragment) => fragment === undefined)) {
      return;
    }
    variants = variants.flatMap((prior) => fragments.map((fragment) => [...prior, fragment ?? ""]));
  }
  return variants.flatMap((variant) =>
    separator.map(
      (fragment) =>
        sqlDialect.sqlToQuery(
          sql.join(
            variant.map((text) => sql.raw(text)),
            sql.raw(fragment ?? ""),
          ),
        ).sql,
    ),
  );
}
function aggregateFragments(call: CallExpression, sqlOperandFragments: SqlFragmentsReader): readonly string[] | undefined {
  const args = call.getArguments();
  const aggregate = (Object.keys(AGGREGATE_OPERATORS) as (keyof typeof AGGREGATE_OPERATORS)[]).find((name) => callsDrizzleOperator(call, name));
  if (aggregate === undefined || !runtimeDrizzleOrigin(call.getExpression())) {
    return;
  }
  if (aggregate === "count" && args.length === 0) {
    return [sqlDialect.sqlToQuery(count()).sql];
  }
  const input = args[0] === undefined ? undefined : sqlOperandFragments(args[0]);
  return args.length !== 1 || input === undefined || input.some((fragment) => fragment === undefined)
    ? undefined
    : input.map((fragment) => sqlDialect.sqlToQuery(AGGREGATE_OPERATORS[aggregate](sql.raw(fragment ?? ""))).sql);
}
function aliasedFragments(call: CallExpression, sqlOperandFragments: SqlFragmentsReader): readonly string[] | undefined {
  const args = call.getArguments();
  const member = staticMemberAccess(call.getExpression());
  if (member?.name !== DRIZZLE_ALIAS_VERB || !runtimeDrizzleOrigin(call.getExpression()) || !sqlValue(member.receiver.getType())) {
    return;
  }
  const receiver = sqlOperandFragments(member.receiver);
  const label = args[0] === undefined ? undefined : readStaticAuthoredScalar(args[0]);
  return args.length === 1 &&
    label?.kind === "resolved" &&
    typeof label.value === "string" &&
    receiver?.every((fragment) => fragment !== undefined && sqliteFragmentContained(fragment)) === true
    ? [sqlDialect.sqlToQuery(sql`${sql.raw("1").as(label.value)}`).sql]
    : undefined;
}
/** Native spelling, installed source and actual operand alternatives must agree. */
export function readNativeSqlConstructor(
  call: CallExpression,
  bindings: ReadonlyMap<MorphNode, MorphNode>,
  sqlOperandFragments: SqlFragmentsReader,
  mappedFragments: SqlFragmentsReader,
): readonly (string | undefined)[] | undefined {
  if (sqlMethod(call, "identifier")) {
    return identifierFragments(call, bindings);
  }
  if (sqlMethod(call, DRIZZLE_SQL_RAW_MEMBER)) {
    return rawFragments(call);
  }
  if (sqlMethod(call, "join")) {
    return joinedFragments(call, bindings, sqlOperandFragments, mappedFragments);
  }
  return aggregateFragments(call, sqlOperandFragments) ?? aliasedFragments(call, sqlOperandFragments);
}
