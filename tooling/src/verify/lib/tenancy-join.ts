// The JOIN half of the tenancy read readers: which tables a drizzle read binds (`.from`, every join verb and the
// relational `db.query.<t>` verbs), what terms its predicates carry, and which owner terms or FK edges scope a table.

import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { readMemberUses } from "../../floor/code-facts/drizzle-column-reads.ts";
import { callsDrizzleOperator } from "../../floor/code-facts/drizzle-operators.ts";
import { readDrizzlePredicate, readPredicateArgument } from "../../floor/code-facts/drizzle-predicate.ts";
import type { DrizzlePredicate } from "../../floor/code-facts/drizzle-predicate-contract.ts";
import type { ChainTerm, ConjunctLeaves, SchemaTableIndex } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { declaredTableOf } from "./tenancy-read.ts";
import { EDGE_ARROW, foreignKeyColumnKey } from "./tenancy-scope.ts";

const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";
const OWNER_COL = "ownerId";

interface ColumnRead {
  readonly receiver: string;
  readonly table: string;
  readonly name: string;
}

/** A column read whose receiver names one declared table: its written receiver, that table and the column. */
function columnOf(node: Node, index: SchemaTableIndex): ColumnRead | undefined {
  const read = staticMemberAccess(unwrapExpression(node));
  const table = read === undefined ? undefined : declaredTableOf(read.receiver, index);
  return read === undefined || table === undefined ? undefined : { receiver: read.receiver.getText(), table, name: read.name };
}

/** Does this node read any column of the table written `ident`? */
export function readsTable(node: Node, ident: string): boolean {
  return readMemberUses(node).some((fact) => fact.kind === "resolved" && fact.value.receiver.getText() === ident);
}

/** Owner authorization is universal across alternatives, and existential only across AND terms. */
function factHolds(fact: DrizzlePredicate, holds: (conjunct: Node, bindings: ReadonlyMap<Node, Node>) => boolean): boolean {
  if (fact.kind === "leaf") {
    return holds(fact.node, fact.bindings);
  }
  if (fact.kind === "and") {
    return fact.terms.some((term) => factHolds(term, holds));
  }
  return (fact.kind === "choice" || fact.kind === "or") && fact.terms.length > 0 && fact.terms.every((term) => factHolds(term, holds));
}

/** Judge scope on canonical predicate facts, never by another helper/binding walk. */
export function predicateHolds(predicates: readonly (Node | undefined)[], holds: (conjunct: Node, bindings: ReadonlyMap<Node, Node>) => boolean): boolean {
  return predicates.some((predicate) => predicate !== undefined && factHolds(readDrizzlePredicate(predicate), holds));
}

function factConjuncts(fact: DrizzlePredicate): readonly Node[] {
  return fact.kind === "and" ? fact.terms.flatMap(factConjuncts) : [fact.node];
}

function conjunctsOf(predicate: Node): readonly Node[] {
  return factConjuncts(readDrizzlePredicate(predicate));
}

function isOwnerColumn(node: Node, ident: string): boolean {
  const read = staticMemberAccess(unwrapExpression(node));
  return read?.name === OWNER_COL && read.receiver.getText() === ident;
}

/** The value side of an owner term on the table written `ident`: `eq(T.ownerId, value)` or
 *  `inArray(T.ownerId, owners)` by its drizzle import, where the value does not read `T` itself; undefined for
 *  any other conjunct. `or`, `ne`, `isNotNull`, a `sql` template and `eq(T.ownerId, T.ownerId)` all name the
 *  column and scope nothing. Whether a column or subselect value is pinned is the caller's second question. */
export function ownerTermValue(conjunct: Node, ident: string, bindings: ReadonlyMap<Node, Node> = new Map()): Node | undefined {
  if (!conjunct.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  const [left, right] = conjunct.getArguments();
  if (left === undefined || right === undefined) {
    return;
  }
  if (callsDrizzleOperator(conjunct, IN_ARRAY_OPERATOR)) {
    const actual = readPredicateArgument(right, bindings);
    return isOwnerColumn(left, ident) && actual.kind === "resolved" && !readsTable(actual.value, ident) ? actual.value : undefined;
  }
  if (!callsDrizzleOperator(conjunct, EQ_OPERATOR)) {
    return;
  }
  if (isOwnerColumn(left, ident) && !readsTable(right, ident)) {
    const actual = readPredicateArgument(right, bindings);
    return actual.kind === "resolved" && !readsTable(actual.value, ident) ? actual.value : undefined;
  }
  const actual = readPredicateArgument(left, bindings);
  return isOwnerColumn(right, ident) && actual.kind === "resolved" && !readsTable(actual.value, ident) ? actual.value : undefined;
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
  return { leaves: fact.kind === "empty" ? [] : [fact.node], opaque: fact.kind === "unresolved" };
}

/** Existential by-id evidence includes every alternative; unreadable SQL or helpers remain opaque. */
export function conjunctLeaves(predicates: readonly (Node | undefined)[]): ConjunctLeaves {
  const parts = predicates.flatMap((predicate) => (predicate === undefined ? [] : [factLeaves(readDrizzlePredicate(predicate))]));
  return { leaves: parts.flatMap((part) => part.leaves), opaque: parts.some((part) => part.opaque) };
}

/** The conjuncts that bind the joined table J to ANOTHER table's row along a declared foreign key that POINTS AT
 *  J — an `eq(J.col, T.col)` term where `T.col -> J.col` is a schema FK edge. This is the FK-chain inheritance
 *  (Spine-Identity-and-Auth §2b): the joined row is the one a bound row references. The reverse edge
 *  (`J.col -> T.col`) is no chain: it fans out to every owner's rows that reference `T`. A term against a value
 *  (a caller-supplied id), an undeclared column pairing, or one inside `or(…)` binds whatever the value names. */
export function chainTermsOf(
  predicates: readonly (Node | undefined)[],
  joinedIdent: string,
  index: SchemaTableIndex,
  fkEdges: ReadonlySet<string>,
): readonly ChainTerm[] {
  const conjuncts = predicates.flatMap((predicate) => (predicate === undefined ? [] : conjunctsOf(predicate)));
  return conjuncts.flatMap((conjunct): ChainTerm[] => {
    if (!(conjunct.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(conjunct, EQ_OPERATOR))) {
      return [];
    }
    const [left, right] = conjunct.getArguments().map((argument) => columnOf(argument, index));
    if (left === undefined || right === undefined || (left.receiver === joinedIdent) === (right.receiver === joinedIdent)) {
      return [];
    }
    const [joined, bound] = left.receiver === joinedIdent ? [left, right] : [right, left];
    const edge = `${foreignKeyColumnKey(bound.table, bound.name)}${EDGE_ARROW}${foreignKeyColumnKey(joined.table, joined.name)}`;
    return fkEdges.has(edge) ? [{ boundTable: bound.table, boundReceiver: bound.receiver, boundColumn: `${bound.receiver}.${bound.name}` }] : [];
  });
}
