// The PIN half of the tenancy read readers: what a predicate value reads, and which conjuncts pin a table's rows to
// a plain value (Spine-Identity-and-Auth §2b). A value is plain only by its TYPE (a string id, or an array of them),
// and a column value scopes an owner term only when its own table is pinned by its class's rule one hop away.
import { staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node, Type } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { callsDrizzleOperator } from "../../floor/code-facts/drizzle-operators.ts";
import { readPredicateArgument, readPredicateColumn } from "../../floor/code-facts/drizzle-predicate-argument.ts";
import { readDrizzleValueSources } from "../../floor/code-facts/drizzle-query.ts";
import type { TypeObservationReader } from "../../floor/code-facts/type-observations-contract.ts";
import type { NativeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import { nodeTypeSelector } from "../../floor/code-facts/type-projection-contract.ts";
import type {
  ForeignKeyParentRead,
  SchemaTableIndex,
  TenancyPinServices,
  TenancySchema,
  ValuePinTarget,
  ValueReceiver,
  ValueSources,
} from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { readsTable } from "./tenancy-join.ts";
import { declaredTableOf, sameReadReceiver, tableRefsOf } from "./tenancy-read.ts";
import { foreignKeysBetween } from "./tenancy-scope.ts";

const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";
const ID_COL = "id";
const CHATS_SQL_NAME = "chats";
/** Project canonical native source facts onto the tenancy classification index. */
export function valueSourcesOf(value: Node, index: SchemaTableIndex, services?: TenancyPinServices): ValueSources {
  const evidence = services?.sourceEvidence(value);
  const fact = evidence?.source ?? readDrizzleValueSources(value);
  if (fact.kind === "unresolved") {
    return { receivers: [], subselects: [], unresolved: true };
  }
  const receivers = new Map<string, ValueReceiver>();
  for (const member of fact.value.members) {
    const native = evidence?.tables.find((table) => table.node === member.receiver);
    if (evidence !== undefined && native === undefined) {
      throw new Error("native pin receiver table evidence is unavailable");
    }
    const refs = tableRefsOf(member.receiver, index, native?.references);
    if (refs.some((ref) => ref.kind === "table" || ref.kind === "subquery")) {
      const receiver = member.receiver.getText();
      receivers.set(receiver, { receiver, table: declaredTableOf(member.receiver, index, native?.references), node: member.receiver });
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
export function isPlainValue(value: Node, index: SchemaTableIndex, services?: TenancyPinServices): boolean {
  const sources = valueSourcesOf(value, index, services);
  if (sources.unresolved || sources.receivers.length > 0 || sources.subselects.length > 0) {
    return false;
  }
  if (services !== undefined) {
    const readers = services.typeObservations(value);
    const root = nodeTypeSelector(value);
    const element = readers.arrayElement(root).element;
    return observedStringLike(element !== null && readers.select(element) !== null ? element : root, readers, new Map());
  }
  const type = value.getType();
  return isStringLike(arrayElementOf(type) ?? type);
}

function observedStringLike(selector: NativeTypeSelector, readers: TypeObservationReader, answers: Map<object, boolean>): boolean {
  const selected = readers.select(selector);
  if (selected === null) {
    return false;
  }
  const identity = readers.type(selected).key;
  const prior = answers.get(identity);
  if (prior !== undefined) {
    return prior;
  }
  const flags = readers.primitiveFlags(selector);
  if (flags.templateLiteral === undefined) {
    throw new Error("native pin template-literal flag was not captured");
  }
  answers.set(identity, false);
  let value = flags.string || flags.stringLiteral || flags.templateLiteral;
  if (!value) {
    const intersections = readers.intersections(selector);
    value =
      intersections.length > 0
        ? intersections.some((member) => observedStringLike(member, readers, answers))
        : readers.type(selected).unionCount > 0 && readers.unions(selector).every((member) => observedStringLike(member, readers, answers));
  }
  answers.set(identity, value);
  return value;
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
export function valuePinTerm(
  conjunct: Node,
  { receiver, column }: ValuePinTarget,
  { index, pins }: Pick<TenancySchema, "index" | "pins">,
  bindings: ReadonlyMap<Node, Node> = new Map(),
): boolean {
  if (!conjunct.isKind(SyntaxKind.CallExpression)) {
    return false;
  }
  const isEq = callsDrizzleOperator(conjunct, EQ_OPERATOR);
  if (!(isEq || callsDrizzleOperator(conjunct, IN_ARRAY_OPERATOR))) {
    return false;
  }
  const [left, right] = conjunct.getArguments();
  const pinsSide = (side: Node | undefined, value: Node | undefined): boolean => {
    const columnSource = side === undefined ? undefined : readPredicateColumn(side, bindings);
    const read = columnSource?.kind === "resolved" ? staticMemberAccess(unwrapExpression(columnSource.value)) : undefined;
    const actualReceiver = read === undefined ? undefined : readPredicateArgument(read.receiver, bindings);
    const actualValue = value === undefined ? undefined : readPredicateArgument(value, bindings);
    return (
      read !== undefined &&
      actualValue?.kind === "resolved" &&
      actualReceiver?.kind === "resolved" &&
      sameReadReceiver(actualReceiver.value, receiver) &&
      (column === undefined || read.name === column) &&
      !readsTable(actualValue.value, receiver) &&
      isPlainValue(actualValue.value, index, pins)
    );
  };
  return pinsSide(left, right) || (isEq && pinsSide(right, left));
}

/** The written receiver of a `parent` row this conjunct binds to the bound row along one declared foreign key
 *  (`eq(P.parentColumn, B.childColumn)`), or undefined. */
export function parentReadOf(
  conjunct: Node,
  bound: ForeignKeyParentRead,
  index: SchemaTableIndex,
  bindings: ReadonlyMap<Node, Node> = new Map(),
): Node | undefined {
  if (!(conjunct.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(conjunct, EQ_OPERATOR))) {
    return;
  }
  const sides = conjunct.getArguments().map((argument) => {
    const column = readPredicateColumn(argument, bindings);
    const member = column.kind === "resolved" ? staticMemberAccess(unwrapExpression(column.value)) : undefined;
    const actual = member === undefined ? undefined : readPredicateArgument(member.receiver, bindings);
    return member === undefined || actual?.kind !== "resolved" ? undefined : { ...member, receiver: actual.value };
  });
  const child = sides.find((side) => side !== undefined && sameReadReceiver(side.receiver, bound.receiver) && side.name === bound.fk.childColumn);
  const other = sides.find((side) => side !== child);
  const otherTable = other === undefined ? undefined : declaredTableOf(other.receiver, index);
  return child !== undefined && other !== undefined && otherTable === bound.parent && other.name === bound.fk.parentColumn ? other.receiver : undefined;
}

/** D18's current-member room scope: a bound roster row must be linked to this exact room, have a plain
 * user pin on its declared principal FK, and exclude departed membership. No helper name grants it. */
export function currentMemberRoomPinned(
  room: Node,
  boundTables: readonly Node[],
  { index, fkEdges, pins }: TenancySchema,
  binds: (test: (conjunct: Node, bindings: ReadonlyMap<Node, Node>) => boolean) => boolean,
): boolean {
  const chats = index.identBySqlName.get("chats");
  const participants = index.identBySqlName.get("chat_participants");
  const users = index.identBySqlName.get("users");
  if (
    chats === undefined ||
    participants === undefined ||
    users === undefined ||
    declaredTableOf(room, index) !== chats ||
    !foreignKeysBetween(fkEdges, participants, users).some((fk) => fk.childColumn === "userId" && fk.parentColumn === ID_COL)
  ) {
    return false;
  }
  return boundTables.some(
    (table) =>
      declaredTableOf(table, index) === participants &&
      binds((conjunct, bindings) =>
        valuePinTerm(conjunct, { receiver: table, column: "userId" }, { index, ...(pins === undefined ? {} : { pins }) }, bindings),
      ) &&
      binds((conjunct, bindings) => {
        if (!(conjunct.isKind(SyntaxKind.CallExpression) && callsDrizzleOperator(conjunct, "isNull"))) {
          return false;
        }
        const argument = conjunct.getArguments()[0];
        const read = argument === undefined ? undefined : staticMemberAccess(unwrapExpression(argument));
        const actual = read === undefined ? undefined : readPredicateArgument(read.receiver, bindings);
        return read?.name === "leftSeq" && actual?.kind === "resolved" && sameReadReceiver(actual.value, table);
      }) &&
      foreignKeysBetween(fkEdges, participants, chats).some(
        (fk) =>
          fk.parentColumn === ID_COL &&
          binds((conjunct, bindings) => {
            const parent = parentReadOf(conjunct, { receiver: table, fk, parent: chats }, index, bindings);
            return parent !== undefined && sameReadReceiver(parent, room);
          }),
      ),
  );
}
