// Installed Drizzle owns delimiters; authored names and borrowed declaration types do not replace its source.
import { existsSync, realpathSync } from "node:fs";
import { dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { SQL } from "drizzle-orm";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gt,
  gte,
  ilike,
  inArray,
  isNotNull,
  isNull,
  like,
  lt,
  lte,
  max,
  min,
  ne,
  not,
  notIlike,
  notInArray,
  notLike,
  or,
  sql,
} from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import type { Node as MorphNode } from "ts-morph";
import { Node } from "ts-morph";
import { callsDrizzleOperator } from "./drizzle-operators.ts";
import { drizzleExportOf } from "./drizzle-table-ref.ts";
import { DRIZZLE_SQL_EXPORT } from "./drizzle-vocabulary.ts";
export const sqlDialect = new SQLiteSyncDialect();
const runtimeDrizzleRoot = dirname(fileURLToPath(import.meta.resolve("drizzle-orm")));
const BINARY_OPERATORS = { eq, ne, gt, gte, lt, lte, inArray, notInArray, like, notLike, ilike, notIlike } as const;
const UNARY_OPERATORS = { isNull, isNotNull, not, asc, desc } as const;
export const AGGREGATE_OPERATORS = { max, min, count } as const;

/** Callable declarations must resolve inside the installed Drizzle runtime. */
export function runtimeDrizzleOrigin(node: MorphNode): boolean {
  const declarations = node
    .getType()
    .getCallSignatures()
    .map((signature) => signature.getDeclaration());
  return (
    declarations.length > 0 &&
    declarations.every((declaration) => {
      const path = declaration.getSourceFile().getFilePath();
      return existsSync(path) && realpathSync(path).startsWith(runtimeDrizzleRoot + sep);
    })
  );
}

/** A native template with one interpolation and no authored grammar carries that exact operand. */
export function transparentNativeSqlOperand(node: MorphNode): MorphNode | undefined {
  if (!Node.isTaggedTemplateExpression(node) || drizzleExportOf(node.getTag()) !== DRIZZLE_SQL_EXPORT || !runtimeDrizzleOrigin(node.getTag())) {
    return;
  }
  const template = node.getTemplate();
  if (!Node.isTemplateExpression(template) || template.getHead().getLiteralText() !== "") {
    return;
  }
  const spans = template.getTemplateSpans();
  const span = spans[0];
  return spans.length === 1 && span?.getLiteral().getLiteralText() === "" ? span.getExpression() : undefined;
}

function fixedOperator(call: import("ts-morph").CallExpression, chunks: readonly SQL[]): SQL | undefined {
  const first = chunks[0];
  const second = chunks[1];
  if (chunks.length === 2 && first !== undefined && second !== undefined) {
    const name = (Object.keys(BINARY_OPERATORS) as (keyof typeof BINARY_OPERATORS)[]).find((key) => callsDrizzleOperator(call, key));
    if (name === undefined) {
      return;
    }
    const binary: (left: SQL, right: SQL) => SQL = BINARY_OPERATORS[name];
    return binary(first, second);
  }
  const name = (Object.keys(UNARY_OPERATORS) as (keyof typeof UNARY_OPERATORS)[]).find((key) => callsDrizzleOperator(call, key));
  return chunks.length === 1 && first !== undefined && name !== undefined ? UNARY_OPERATORS[name](first) : undefined;
}

// Native constructors own their emitted delimiters: notably AND with one child adds no parentheses.
/** Render delimiters with the installed operator, including omitted undefined operands. */
export function nativeOperatorFragment(call: import("ts-morph").CallExpression, fragments: readonly (string | undefined)[]): string | undefined {
  if (!runtimeDrizzleOrigin(call.getExpression())) {
    return;
  }
  const chunks = fragments.map((fragment) => (fragment === undefined ? undefined : sql.raw(fragment)));
  let result: SQL | undefined;
  if (callsDrizzleOperator(call, "and")) {
    result = and(...chunks);
  } else if (callsDrizzleOperator(call, "or")) {
    result = or(...chunks);
  } else {
    result = chunks.some((chunk) => chunk === undefined)
      ? undefined
      : fixedOperator(
          call,
          chunks.filter((chunk) => chunk !== undefined),
        );
  }
  return result === undefined ? undefined : sqlDialect.sqlToQuery(result).sql;
}
