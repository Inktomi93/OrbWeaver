// Native Drizzle row-source candidates; declaration and tenancy judgments remain consumer-owned.

import type { CallExpression, Node } from "ts-morph";
import { Node as MorphNode, SyntaxKind } from "ts-morph";
import { readMemberUses } from "./drizzle-column-reads.ts";
import { relationalWhereCallback } from "./drizzle-operators.ts";
import type { DrizzleValueSources, ReadAnchor, RelationalWhere } from "./drizzle-query-contract.ts";
import { DRIZZLE_FROM_VERB, DRIZZLE_JOIN_VERBS, DRIZZLE_RELATIONAL_ROOT, DRIZZLE_RELATIONAL_VERBS } from "./drizzle-vocabulary.ts";
import { unwrapExpression as unwrapValueExpression } from "./expression-value.ts";
import { resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { unwrapTarget as unwrapExpression } from "./reference-fact-alias.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { resolved } from "./type-member-origin-core.ts";

const JOIN_VERBS: ReadonlySet<string> = new Set(DRIZZLE_JOIN_VERBS);
const RELATIONAL_VERBS: ReadonlySet<string> = new Set(DRIZZLE_RELATIONAL_VERBS);

/** The table a `.from(T)` or a join call binds into a read, however the member is spelled; undefined for every
 *  other call. This is the syntactic candidate only: the caller confirms the verb by its declaration. */
export function readAnchorOf(node: Node): ReadAnchor | undefined {
  if (!node.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const verb = staticMemberAccess(node.getExpression())?.name;
  if (verb !== undefined && RELATIONAL_VERBS.has(verb)) {
    return relationalAnchorOf(node);
  }
  const [table, on] = node.getArguments();
  if (verb === undefined || table === undefined) {
    return;
  }
  if (verb === DRIZZLE_FROM_VERB) {
    return { kind: "from", call: node, table };
  }
  return JOIN_VERBS.has(verb) ? { kind: "join", call: node, table, on } : undefined;
}

/** The relational-API read `<db>.query.<t>.findFirst|findMany(config)`: the `<t>` member names the table. */
function relationalAnchorOf(call: CallExpression): ReadAnchor | undefined {
  const verb = staticMemberAccess(call.getExpression());
  const receiver = verb === undefined ? undefined : resolveStableExpression(verb.receiver);
  let value: Node | undefined;
  if (receiver?.kind === "resolved") {
    value = receiver.value;
  } else if (receiver?.reason === "dynamic") {
    value = receiver.node;
  }
  const table = value === undefined ? undefined : staticMemberAccess(unwrapExpression(value));
  const root = table === undefined ? undefined : staticMemberAccess(unwrapExpression(table.receiver));
  return table !== undefined && root?.name === DRIZZLE_RELATIONAL_ROOT
    ? { kind: "relational", call, table: table.nameNode, config: call.getArguments()[0] }
    : undefined;
}

/** Every table a subquery's inner select binds: the read anchors within that one bounded expression. */
export function innerReadAnchorsOf(select: Node): readonly ReadAnchor[] {
  return [select, ...select.getDescendantsOfKind(SyntaxKind.CallExpression)].flatMap((node) => {
    const anchor = readAnchorOf(node);
    return anchor === undefined ? [] : [anchor];
  });
}

/** Native row-member and subselect inputs, through the canonical cycle-safe immutable binding resolver. */
export function readDrizzleValueSources(node: Node): ReferenceFact<DrizzleValueSources> {
  const source = resolveStableExpression(node);
  const parameter = source.kind === "unresolved" && source.reason === "missing" && MorphNode.isParameterDeclaration(source.node);
  if (source.kind === "unresolved" && source.reason !== "dynamic" && !parameter) {
    return source;
  }
  const terminal = source.kind === "resolved" ? source.value : source.node;
  const value = parameter ? unwrapExpression(node) : terminal;
  if (innerReadAnchorsOf(value).length > 0) {
    return resolved({ members: [], subselects: [value] }, value, source.trace.declarations);
  }
  const members = readMemberUses(value).flatMap((fact) => (fact.kind === "resolved" ? [fact.value] : []));
  return resolved({ members, subselects: [] }, value, source.trace.declarations);
}

/** Relational callback and direct SQL forms retain the existing source grammar. */
export function readRelationalWhere(where: Node | undefined, table: string): RelationalWhere | undefined {
  const value = where === undefined ? undefined : unwrapValueExpression(where);
  if (value === undefined || !(value.isKind(SyntaxKind.ArrowFunction) || value.isKind(SyntaxKind.FunctionExpression))) {
    return { receiver: table, predicate: value };
  }
  const body = value.getBody();
  const [row] = value.getParameters();
  return row === undefined || value.isAsync() || !relationalWhereCallback(value) || body.isKind(SyntaxKind.Block)
    ? undefined
    : { receiver: row.getName(), predicate: body };
}

/** Preserve shorthand and unreadable property carriers rather than inventing a config value. */
export function readRelationalConfigProperty(config: Node | undefined, name: string): Node | undefined {
  const assigned = config?.isKind(SyntaxKind.ObjectLiteralExpression) === true ? config.getProperty(name) : undefined;
  if (assigned?.isKind(SyntaxKind.ShorthandPropertyAssignment) === true) {
    return assigned.getNameNode();
  }
  return assigned?.isKind(SyntaxKind.PropertyAssignment) === true ? assigned.getInitializer() : assigned;
}
