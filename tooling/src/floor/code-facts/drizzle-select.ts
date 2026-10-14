// One fluent select/projection extraction shared by column lenses, tenancy and persisted-value tracing.
import { Node, SyntaxKind } from "ts-morph";
import { readAnchorOf } from "./drizzle-query.ts";
import type { DrizzleBuilderChain } from "./drizzle-query-contract.ts";
import type { DrizzleProjectedColumn, DrizzleSelection } from "./drizzle-select-contract.ts";
import { resolveDrizzleTableRefs } from "./drizzle-table-ref.ts";
import { readMemberReference, resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "./reference-fact.ts";
import { unwrapTarget } from "./reference-fact-alias.ts";
import type { ReferenceFact } from "./reference-fact-contract.ts";
import { MEMBER_ACCESS_KINDS } from "./reference-fact-contract.ts";
import type { SchemaModel } from "./schema-model-contract.ts";
import { readSchemaObjectMembers } from "./schema-object.ts";
import { terminalCall } from "./schema-value.ts";
import { resolved, unresolved } from "./type-member-origin-core.ts";

const SCHEMA_PACKAGE = "@orb/db";
const SELECT_VERBS: ReadonlySet<string> = new Set(["select", "selectDistinct"]);

function builderParent(cur: Node): Node | undefined {
  const parent = cur.getParent();
  if (parent === undefined) {
    return;
  }
  const continuesChain =
    parent.isKind(SyntaxKind.AwaitExpression) ||
    Node.isParenthesizedExpression(parent) ||
    Node.isNonNullExpression(parent) ||
    Node.isAsExpression(parent) ||
    Node.isSatisfiesExpression(parent) ||
    (Node.isConditionalExpression(parent) && parent.getCondition() !== cur) ||
    (parent.isKind(SyntaxKind.CallExpression) && parent.getExpression() === cur) ||
    (MEMBER_ACCESS_KINDS.some((kind) => parent.isKind(kind)) && parent.getFirstChild() === cur);
  return continuesChain ? parent : undefined;
}

/** The outermost node of a read's own builder chain, and the calls applied along the way. */
export function readFollowingSelectChain(start: Node): DrizzleBuilderChain {
  const calls: import("ts-morph").CallExpression[] = [];
  let cur: Node = start;
  for (let parent = builderParent(cur); parent !== undefined; parent = builderParent(cur)) {
    if (parent.isKind(SyntaxKind.CallExpression)) {
      calls.push(parent);
    }
    cur = parent;
  }
  return { top: cur, calls };
}

/** The select that actually underlies this expression, with its authored projection and row source. */
export function readDrizzleSelection(node: Node): DrizzleSelection | undefined {
  let current = unwrapTarget(node);
  let source: Node | undefined;
  let selection: DrizzleSelection | undefined;
  const calls: import("ts-morph").CallExpression[] = [];
  const output = Node.isCallExpression(current) && staticMemberAccess(current.getExpression())?.name === "get" ? "row" : "rows";
  while (Node.isCallExpression(current)) {
    const member = staticMemberAccess(current.getExpression());
    if (member === undefined) {
      return;
    }
    calls.push(current);
    if (member.name === "from") {
      source = current.getArguments()[0];
    }
    if (SELECT_VERBS.has(member.name)) {
      const head = terminalCall(member.receiver);
      if (head.kind === "resolved" && staticMemberAccess(head.value.getExpression())?.name === "with") {
        calls.push(head.value);
      }
      const sqlOperands = calls.flatMap((call) => (SELECT_VERBS.has(staticMemberAccess(call.getExpression())?.name ?? "") ? [] : call.getArguments()));
      selection = { root: current, source, projection: current.getArguments()[0], output, calls, sqlOperands };
      break;
    }
    current = unwrapTarget(member.receiver);
  }
  return selection;
}

function fullRowColumn(selection: DrizzleSelection, name: string, schema: SchemaModel): ReferenceFact<DrizzleProjectedColumn | undefined> {
  const anchors = selection.calls.flatMap((candidate) => {
    const anchor = readAnchorOf(candidate);
    return anchor === undefined ? [] : [anchor];
  });
  const source = selection.source;
  if (source === undefined || anchors.length !== 1 || anchors[0]?.kind !== "from") {
    return unresolved("unsupported", selection.root, "full-row column lineage requires one table source without joins");
  }
  const refs = resolveDrizzleTableRefs(source, (declaration) => schema.tables.some((table) => table.declaration.compilerNode === declaration.compilerNode));
  const ref = refs[0];
  if (refs.length !== 1 || ref === undefined || ref.kind === "subquery" || ref.kind === "raw-sql" || ref.kind === "unresolved") {
    return unresolved("unsupported", source, "full-row source does not resolve to one schema table");
  }
  if (ref.kind === "imported") {
    const origin = resolveModuleMemberOrigin(source);
    const canonical = origin.kind === "resolved" ? origin.value.canonical : undefined;
    if (canonical?.kind !== "external-door" || canonical.moduleSpecifier !== SCHEMA_PACKAGE || canonical.exportedName !== ref.name) {
      return unresolved("unsupported", source, "an unresolved imported full-row source is not the schema package's table door");
    }
  }
  const tables = schema.tables.filter((table) => {
    if (ref.kind === "table") {
      return table.declaration.compilerNode === ref.declaration.compilerNode;
    }
    return ref.kind === "imported" ? table.identity.declarationName === ref.name : table.sqlName === ref.sqlName;
  });
  const selectedTable = tables[0];
  if (tables.length !== 1 || selectedTable === undefined) {
    return unresolved("ambiguous", source, "full-row source must match exactly one admitted schema table");
  }
  const column = selectedTable.columns.find((entry) => entry.identity.propertyName === name);
  return column === undefined
    ? resolved(undefined, source, [selectedTable.declaration])
    : resolved({ name, receiver: source, origin: column.declaration }, column.declaration, [selectedTable.declaration, column.declaration]);
}

/** Actual field lineage; an authored label or an omitted ambiguous field map never supplies table identity. */
export function readDrizzleProjectedColumn(select: Node, name: string, schema: SchemaModel): ReferenceFact<DrizzleProjectedColumn | undefined> {
  const selection = readDrizzleSelection(select);
  if (selection === undefined) {
    return resolved(undefined, select, []);
  }
  if (selection.projection === undefined) {
    return fullRowColumn(selection, name, schema);
  }
  const members = readSchemaObjectMembers(selection.projection);
  if (members.kind === "unresolved") {
    return members;
  }
  const entry = members.value.entries.findLast((field) => field.name === name);
  if (entry === undefined) {
    return resolved(undefined, selection.projection, members.trace.declarations);
  }
  const source = resolveStableExpression(entry.value);
  if (source.kind === "unresolved" && source.reason !== "dynamic") {
    return source;
  }
  const member = readMemberReference(source.kind === "resolved" ? source.value : source.node);
  return member.kind === "resolved"
    ? { ...member, value: { name: member.value.name, receiver: member.value.receiver, origin: member.value.access } }
    : unresolved("unsupported", entry.value, "the selected field is not a readable column member");
}
