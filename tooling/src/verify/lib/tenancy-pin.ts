// The PIN half of the tenancy read readers: what a predicate value reads, and which conjuncts pin a table's rows to
// a plain value (Spine-Identity-and-Auth §2b). A value is plain only by its TYPE (a string id, or an array of them),
// and a column value scopes an owner term only when its own table is pinned by its class's rule one hop away.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node, Type } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { callsDrizzleOperator } from "../../floor/code-facts/drizzle-operators.ts";
import { readDrizzleValueSources } from "../../floor/code-facts/drizzle-query.ts";
import type { ForeignKeyColumns, SchemaTableIndex, ValueReceiver, ValueSources } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readsTable } from "./tenancy-join.ts";
import { declaredTableOf, tableRefsOf } from "./tenancy-read.ts";
import { foreignKeysBetween } from "./tenancy-scope.ts";

const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";
const ID_COL = "id";
const CHATS_SQL_NAME = "chats";
/** Project canonical native source facts onto the tenancy classification index. */
export function valueSourcesOf(value: Node, index: SchemaTableIndex): ValueSources {
  const fact = readDrizzleValueSources(value);
  if (fact.kind === "unresolved") {
    return { receivers: [], subselects: [], unresolved: true };
  }
  const receivers = new Map<string, ValueReceiver>();
  for (const member of fact.value.members) {
    const refs = tableRefsOf(member.receiver, index);
    if (refs.some((ref) => ref.kind === "table" || ref.kind === "subquery")) {
      const receiver = member.receiver.getText();
      receivers.set(receiver, { receiver, table: declaredTableOf(member.receiver, index) });
    }
  }
  return { receivers: [...receivers.values()], subselects: fact.value.subselects, unresolved: false };
}

function isStringLike(type: Type): boolean {
  if (type.isString() || type.isStringLiteral() || type.isTemplateLiteral()) {
    return true;
  }
  if (type.isIntersection()) {
    return type.getIntersectionTypes().some((member) => isStringLike(member));
  }
  return type.isUnion() && type.getUnionTypes().every((member) => isStringLike(member));
}

/** Is this value a plain caller value by its TYPE: a string or branded string id, or an array of them? A column,
 *  a builder, an untyped parameter and a nullable id are not. */
export function isPlainValue(value: Node, index: SchemaTableIndex): boolean {
  const sources = valueSourcesOf(value, index);
  if (sources.unresolved || sources.receivers.length > 0 || sources.subselects.length > 0) {
    return false;
  }
  const type = value.getType();
  return isStringLike(arrayElementOf(type) ?? type);
}

function arrayElementOf(type: Type): Type | undefined {
  if (type.isArray()) {
    return type.getArrayElementType();
  }
  return type.isReadonlyArray() ? type.getTypeArguments()[0] : undefined;
}

/** The columns a plain value may pin to pin a MEMBERSHIP-class table's rows: its own id and its chat FK. */
export function membershipPinColumns(table: string, index: SchemaTableIndex, fkEdges: ReadonlySet<string>): readonly string[] {
  const chats = index.identBySqlName.get(CHATS_SQL_NAME);
  const chatFks = chats === undefined ? [] : foreignKeysBetween(fkEdges, table, chats).filter((fk) => fk.parentColumn === ID_COL);
  return [ID_COL, ...chatFks.map((fk) => fk.childColumn)];
}

/** Does this conjunct pin the rows of the table written `receiver` to a plain value: `eq(R.col, value)` or
 *  `inArray(R.col, values)`? `column` narrows it to one column. */
export function valuePinTerm(conjunct: Node, receiver: string, index: SchemaTableIndex, column?: string): boolean {
  if (!conjunct.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const isEq = callsDrizzleOperator(conjunct, EQ_OPERATOR);
  if (!(isEq || callsDrizzleOperator(conjunct, IN_ARRAY_OPERATOR))) {
    return false;
  }
  const [left, right] = conjunct.getArguments();
  const pins = (side: Node | undefined, value: Node | undefined): boolean => {
    const read = side === undefined ? undefined : staticMemberAccess(unwrapExpression(side));
    return (
      read !== undefined &&
      value !== undefined &&
      read.receiver.getText() === receiver &&
      (column === undefined || read.name === column) &&
      !readsTable(value, receiver) &&
      isPlainValue(value, index)
    );
  };
  return pins(left, right) || (isEq && pins(right, left));
}

/** The written receiver of a `parent` row this conjunct binds to the bound row along one declared foreign key
 *  (`eq(P.parentColumn, B.childColumn)`), or undefined. */
export function parentReceiverOf(
  conjunct: Node,
  bound: { readonly receiver: string; readonly fk: ForeignKeyColumns },
  parent: string,
  index: SchemaTableIndex,
): string | undefined {
  if (!(conjunct.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(conjunct, EQ_OPERATOR))) {
    return;
  }
  const sides = conjunct.getArguments().map((argument) => staticMemberAccess(unwrapExpression(argument)));
  const child = sides.find((side) => side?.receiver.getText() === bound.receiver && side.name === bound.fk.childColumn);
  const other = sides.find((side) => side !== child);
  const otherTable = other === undefined ? undefined : declaredTableOf(other.receiver, index);
  return child !== undefined && other !== undefined && otherTable === parent && other.name === bound.fk.parentColumn ? other.receiver.getText() : undefined;
}
