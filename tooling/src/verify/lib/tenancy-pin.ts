// The PIN half of the tenancy read readers: what a predicate value reads, and which conjuncts pin a table's rows to
// a plain value (Spine-Identity-and-Auth §2b). A column or subselect value scopes an owner term only one hop deep:
// its own table must carry such a value pin in the same statement.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { ForeignKeyColumns, SchemaTableIndex, ValueSources } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { MEMBER_ACCESS_KINDS } from "./symbol-reference.ts";
import { innerReadAnchorsOf, readsTable } from "./tenancy-join.ts";
import { callsDrizzleOperator, declaredTableOf, tableRefsOf } from "./tenancy-read.ts";

const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";

/** The table and subquery columns a value reads, by written receiver, and the subselects it runs. A subselect is
 *  one source; its own anchors are judged inside it. */
export function valueSourcesOf(value: Node, index: SchemaTableIndex): ValueSources {
  const unwrapped = unwrapExpression(value);
  if (innerReadAnchorsOf(unwrapped).length > 0) {
    return { receivers: [], subselects: [unwrapped] };
  }
  const reads = [unwrapped, ...MEMBER_ACCESS_KINDS.flatMap((kind) => unwrapped.getDescendantsOfKind(kind))];
  const receivers = reads.flatMap((read) => {
    const member = staticMemberAccess(read);
    const isRowSource = member !== undefined && tableRefsOf(member.receiver, index).some((ref) => ref.kind === "table" || ref.kind === "subquery");
    return member !== undefined && isRowSource ? [member.receiver.getText()] : [];
  });
  return { receivers: [...new Set(receivers)], subselects: [] };
}

function isPlainValue(value: Node, index: SchemaTableIndex): boolean {
  const sources = valueSourcesOf(value, index);
  return sources.receivers.length === 0 && sources.subselects.length === 0;
}

/** Does this conjunct pin the rows of the table written `receiver` to a plain value: `eq(R.col, value)` or
 *  `inArray(R.col, values)` where the value reads no table and runs no subselect? `column` narrows it to one column. */
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
