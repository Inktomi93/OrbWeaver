// The JOIN half of the tenancy read readers: which tables a drizzle read binds (`.from`, every join verb and the
// relational `db.query.<t>` verbs), what terms its predicates carry, and which owner terms or FK edges scope a table.

import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { readMemberUses } from "../../floor/code-facts/drizzle-column-reads.ts";
import { callsDrizzleOperator } from "../../floor/code-facts/drizzle-operators.ts";
import { readDrizzlePredicate } from "../../floor/code-facts/drizzle-predicate.ts";
import { readPredicateArgument, readPredicateColumn } from "../../floor/code-facts/drizzle-predicate-argument.ts";
import type { DrizzlePredicate } from "../../floor/code-facts/drizzle-predicate-contract.ts";
import type { CallReturnObservations } from "../../floor/code-facts/reference-fact-contract.ts";
import { unwrapExpression } from "./ast-read.ts";
import { sameReadReceiver } from "./tenancy-read.ts";

const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";
const OWNER_COL = "ownerId";

/** Does this node read any column of the table written `ident`? */
function readsTable(node: Node, ident: string | Node): boolean {
  return readMemberUses(node).some((fact) => fact.kind === "resolved" && sameReadReceiver(fact.value.receiver, ident));
}

function scopedWhenPresent(fact: DrizzlePredicate, holds: (conjunct: Node, bindings: ReadonlyMap<Node, Node>) => boolean): boolean {
  if (!fact.contained) {
    return false;
  }
  if (fact.presence === "absent") {
    return true;
  }
  if (fact.kind === "leaf") {
    return holds(fact.node, fact.bindings);
  }
  if (fact.kind !== "and" && fact.kind !== "or" && fact.kind !== "choice") {
    return false;
  }
  const scoped = fact.terms.map((term) => scopedWhenPresent(term, holds));
  return scoped.every(Boolean) || (fact.kind === "and" && fact.terms.some((term, index) => term.presence === "present" && scoped[index] === true));
}

/** Absent optional operands grant nothing; every emitted OR/choice arm still owes the same scope. */
function factHolds(fact: DrizzlePredicate, holds: (conjunct: Node, bindings: ReadonlyMap<Node, Node>) => boolean): boolean {
  return fact.presence === "present" && scopedWhenPresent(fact, holds);
}

/** Judge scope on canonical predicate facts, never by another helper/binding walk. */
export function predicateHolds(
  predicates: readonly (Node | undefined)[],
  holds: (conjunct: Node, bindings: ReadonlyMap<Node, Node>) => boolean,
  observations?: CallReturnObservations,
): boolean {
  return predicates.some((predicate) => predicate !== undefined && factHolds(readDrizzlePredicate(predicate, observations), holds));
}

function isOwnerColumn(node: Node, ident: string | Node, bindings: ReadonlyMap<Node, Node>): boolean {
  const column = readPredicateColumn(node, bindings);
  const read = column.kind === "resolved" ? staticMemberAccess(unwrapExpression(column.value)) : undefined;
  const actual = read === undefined ? undefined : readPredicateArgument(read.receiver, bindings);
  return read?.name === OWNER_COL && actual?.kind === "resolved" && sameReadReceiver(actual.value, ident);
}

/** The value side of an owner term on the table written `ident`: `eq(T.ownerId, value)` or
 *  `inArray(T.ownerId, owners)` by its drizzle import, where the value does not read `T` itself; undefined for
 *  any other conjunct. `or`, `ne`, `isNotNull`, a `sql` template and `eq(T.ownerId, T.ownerId)` all name the
 *  column and scope nothing. Whether a column or subselect value is pinned is the caller's second question. */
export function ownerTermValue(conjunct: Node, ident: string | Node, bindings: ReadonlyMap<Node, Node> = new Map()): Node | undefined {
  if (!conjunct.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const [left, right] = conjunct.getArguments();
  if (left === undefined || right === undefined) {
    return;
  }
  if (callsDrizzleOperator(conjunct, IN_ARRAY_OPERATOR)) {
    const actual = readPredicateArgument(right, bindings);
    return isOwnerColumn(left, ident, bindings) && actual.kind === "resolved" && !readsTable(actual.value, ident) ? actual.value : undefined;
  }
  if (!callsDrizzleOperator(conjunct, EQ_OPERATOR)) {
    return;
  }
  if (isOwnerColumn(left, ident, bindings) && !readsTable(right, ident)) {
    const actual = readPredicateArgument(right, bindings);
    return actual.kind === "resolved" && !readsTable(actual.value, ident) ? actual.value : undefined;
  }
  const actual = readPredicateArgument(left, bindings);
  return isOwnerColumn(right, ident, bindings) && actual.kind === "resolved" && !readsTable(actual.value, ident) ? actual.value : undefined;
}
