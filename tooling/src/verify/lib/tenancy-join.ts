// The JOIN half of the tenancy read readers: which tables a drizzle read binds (`.from`, every join verb and the
// relational `db.query.<t>` verbs), what terms its predicates carry, and which owner terms or FK edges scope a table.

import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { readMemberUses } from "../../floor/code-facts/drizzle-column-reads.ts";
import { callsDrizzleOperator } from "../../floor/code-facts/drizzle-operators.ts";
import { readDrizzlePredicate } from "../../floor/code-facts/drizzle-predicate.ts";
import { readPredicateArgument } from "../../floor/code-facts/drizzle-predicate-argument.ts";
import type { DrizzlePredicate } from "../../floor/code-facts/drizzle-predicate-contract.ts";
import type { CallReturnObservations } from "../../floor/code-facts/reference-fact-contract.ts";
import type { ChainTerm, ConjunctLeaves, SchemaTableIndex, TenancySchema } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { declaredTableOf, predicatesReadColumn, sameReadReceiver } from "./tenancy-read.ts";
import { EDGE_ARROW, foreignKeyColumnKey } from "./tenancy-scope.ts";

const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";
const OWNER_COL = "ownerId";

interface ColumnRead {
  readonly receiver: string;
  readonly table: string;
  readonly name: string;
  readonly node: Node;
}

/** A column read whose receiver names one declared table: its written receiver, that table and the column. */
function columnOf(node: Node, index: SchemaTableIndex, bindings: ReadonlyMap<Node, Node> = new Map()): ColumnRead | undefined {
  const read = staticMemberAccess(unwrapExpression(node));
  const actual = read === undefined ? undefined : readPredicateArgument(read.receiver, bindings);
  const receiver = actual?.kind === "resolved" ? actual.value : undefined;
  const table = receiver === undefined ? undefined : declaredTableOf(receiver, index);
  return read === undefined || receiver === undefined || table === undefined
    ? undefined
    : { receiver: receiver.getText(), table, name: read.name, node: receiver };
}

/** Does this node read any column of the table written `ident`? */
export function readsTable(node: Node, ident: string | Node): boolean {
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

function factMayReadColumn(fact: DrizzlePredicate, receiver: Node, column: string): boolean {
  if (fact.kind === "leaf") {
    return predicatesReadColumn(fact.node, receiver, column, fact.bindings);
  }
  return (fact.kind === "and" || fact.kind === "or" || fact.kind === "choice") && fact.terms.some((term) => factMayReadColumn(term, receiver, column));
}

/** By-id evidence is existential across alternatives, retaining actual helper argument bindings. */
export function predicateMayReadColumn(predicate: Node, receiver: Node, column: string, observations?: CallReturnObservations): boolean {
  return factMayReadColumn(readDrizzlePredicate(predicate, observations), receiver, column);
}

/** Unknown SQL can widen its siblings; containment alone never supplies scope. */
export function predicatesContained(predicates: readonly (Node | undefined)[], observations?: CallReturnObservations): boolean {
  return predicates.every((predicate) => predicate === undefined || readDrizzlePredicate(predicate, observations).contained);
}

function isOwnerColumn(node: Node, ident: string | Node, bindings: ReadonlyMap<Node, Node>): boolean {
  const read = staticMemberAccess(unwrapExpression(node));
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

/** Does this conjunct select rows by a VALUE on the written column (`eq(chats.anchorPersonaId, personaId)`,
 *  `inArray(personas.id, ids)`)? A term against another table's column is a join condition, not a selection. */
export function selectsByValue(conjunct: Node, column: string, index: SchemaTableIndex): boolean {
  if (!(conjunct.isKind(SyntaxKind.CallExpression) && (callsDrizzleOperator(conjunct, EQ_OPERATOR) || callsDrizzleOperator(conjunct, IN_ARRAY_OPERATOR)))) {
    return false;
  }
  const [left, right] = conjunct.getArguments();
  const names = (node: Node | undefined): boolean => node !== undefined && unwrapExpression(node).getText() === column;
  const isValue = (node: Node | undefined): boolean => node !== undefined && columnOf(node, index) === undefined;
  return (names(left) && isValue(right)) || (names(right) && isValue(left));
}

function factLeaves(fact: DrizzlePredicate): ConjunctLeaves {
  if (fact.kind === "and" || fact.kind === "or" || fact.kind === "choice") {
    const parts = fact.terms.map(factLeaves);
    return { leaves: parts.flatMap((part) => part.leaves), opaque: parts.some((part) => part.opaque) };
  }
  return { leaves: fact.kind === "empty" ? [] : [fact.node], opaque: fact.kind === "unresolved" || !fact.contained };
}

/** Existential by-id evidence includes every alternative; unreadable SQL or helpers remain opaque. */
export function conjunctLeaves(predicates: readonly (Node | undefined)[], observations?: CallReturnObservations): ConjunctLeaves {
  const parts = predicates.flatMap((predicate) => (predicate === undefined ? [] : [factLeaves(readDrizzlePredicate(predicate, observations))]));
  return { leaves: parts.flatMap((part) => part.leaves), opaque: parts.some((part) => part.opaque) };
}

/** The conjuncts that bind the joined table J to ANOTHER table's row along a declared foreign key that POINTS AT
 *  J — an `eq(J.col, T.col)` term where `T.col -> J.col` is a schema FK edge. This is the FK-chain inheritance
 *  (Spine-Identity-and-Auth §2b): the joined row is the one a bound row references. The reverse edge
 *  (`J.col -> T.col`) is no chain: it fans out to every owner's rows that reference `T`. A term against a value
 *  (a caller-supplied id), an undeclared column pairing, or one inside `or(…)` binds whatever the value names. */
export function chainTermsOf(predicates: readonly (Node | undefined)[], joinedIdent: string, schema: TenancySchema): readonly ChainTerm[] {
  const { index, fkEdges, observations } = schema;
  const leafTerms = (conjunct: Node, bindings: ReadonlyMap<Node, Node>): readonly ChainTerm[] => {
    if (!(conjunct.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(conjunct, EQ_OPERATOR))) {
      return [];
    }
    const [left, right] = conjunct.getArguments().map((argument) => columnOf(argument, index, bindings));
    if (left === undefined || right === undefined || (left.receiver === joinedIdent) === (right.receiver === joinedIdent)) {
      return [];
    }
    const [joined, bound] = left.receiver === joinedIdent ? [left, right] : [right, left];
    const edge = `${foreignKeyColumnKey(bound.table, bound.name)}${EDGE_ARROW}${foreignKeyColumnKey(joined.table, joined.name)}`;
    return fkEdges.has(edge)
      ? [{ boundTable: bound.table, boundReceiver: bound.receiver, boundColumn: `${bound.receiver}.${bound.name}`, boundRead: bound.node }]
      : [];
  };
  const candidatesOf = (fact: DrizzlePredicate): readonly ChainTerm[] => {
    if (fact.kind === "leaf") {
      return leafTerms(fact.node, fact.bindings);
    }
    if (fact.kind !== "and" && fact.kind !== "or" && fact.kind !== "choice") {
      return [];
    }
    return fact.terms.flatMap(candidatesOf);
  };
  const sameTerm = (left: ChainTerm, right: ChainTerm): boolean =>
    left.boundTable === right.boundTable && sameReadReceiver(left.boundRead, right.boundRead) && left.boundColumn === right.boundColumn;
  return predicates.flatMap((predicate) => {
    if (predicate === undefined) {
      return [];
    }
    const fact = readDrizzlePredicate(predicate, observations);
    const candidates = candidatesOf(fact);
    return candidates.filter(
      (term, position) =>
        candidates.findIndex((candidate) => sameTerm(candidate, term)) === position &&
        factHolds(fact, (conjunct, bindings) => leafTerms(conjunct, bindings).some((candidate) => sameTerm(candidate, term))),
    );
  });
}
