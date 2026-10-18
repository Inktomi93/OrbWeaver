// Direct owner-read syntax is deliberately not callable provenance or SQL containment (D328).

import { drizzleExportOf } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import { literalMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import { unwrapTarget } from "@orb/tooling/floor/code-facts/reference-fact-alias";
import type { CallExpression, Identifier, Node } from "ts-morph";
import { Node as N, SyntaxKind, VariableDeclarationKind } from "ts-morph";
import { RELATIONAL_VERBS } from "../../floor/code-facts/drizzle-operators.ts";
import { enclosingFn } from "../../floor/code-facts/function-context.ts";
import type { DirectOwnerRead, DirectOwnerReadInputs, DirectOwnerReadScope, ReadAnchor } from "../contract/tenancy.ts";
import { classifyDrizzleClientCall } from "./drizzle-client-call.ts";
import { hasPostFetchFilter } from "./tenancy-read.ts";
import { callsAround, filterArguments, imported, JOINS, predicateColumns, statementGap } from "./tenancy-read-chain.ts";
import { EDGE_ARROW, foreignKeyColumnKey } from "./tenancy-scope.ts";

const QUERY_ROOTS = new Set(["select", "selectDistinct", "from", "$with"]);
const FILTERS = new Set(["eq", "inArray", "ne", "gt", "gte", "lt", "lte", "like", "notLike", "isNull", "isNotNull"]);
const NAKED = "a direct by-id READ of an ownerId-scoped table has no owner predicate in the visible local filter";
const UNJOINED = "a direct join binds an ownerId-scoped table without an owner predicate or a declared FK pointing at it";
const SATELLITE = "a direct join is scoped only by a satellite of its own target; the circular FK is not an owner restriction";

/** Literal anchors never expand a relational receiver or computed callable. */
export function directOwnerReadAnchor(node: CallExpression): ReadAnchor | undefined {
  const member = literalMemberAccess(node.getExpression());
  if (member === undefined) {
    return;
  }
  const table = node.getArguments()[0];
  if (RELATIONAL_VERBS.has(member.name)) {
    return { kind: "relational", call: node, table: literalMemberAccess(member.receiver)?.nameNode ?? member.receiver, config: table };
  }
  if (table === undefined) {
    return;
  }
  if (member.name === "from") {
    return { kind: "from", call: node, table };
  }
  return JOINS.has(member.name) ? { kind: "join", call: node, table, on: node.getArguments()[1] } : undefined;
}

interface DirectColumn {
  readonly table: string;
  readonly name: string;
}

interface PredicateObservation {
  readonly known: boolean;
  readonly byId: ReadonlySet<string>;
  readonly owners: ReadonlySet<string>;
  /** Tables whose owner term is valued by a column; §2b class pins decide those, not this check. */
  readonly columnOwners: ReadonlySet<string>;
  readonly edges: ReadonlySet<string>;
}

type OwnerValue = "plain" | "column" | "opaque";

function unknown(reason: string): DirectOwnerRead {
  return { kind: "unknown", reason };
}
function observed(finding?: string): DirectOwnerRead {
  return { kind: "supported", ...(finding === undefined ? {} : { finding }) };
}

function column(node: Node | undefined, scope: DirectOwnerReadScope): DirectColumn | undefined {
  if (node === undefined) {
    return;
  }
  const member = literalMemberAccess(unwrapTarget(node));
  const fact = scope.columns.get(unwrapTarget(node));
  if (member !== undefined && imported(member.receiver) && fact === undefined) {
    throw new Error("direct owner-read native column evidence is unavailable");
  }
  if (member === undefined || fact?.mode !== "column" || fact.column.kind !== "resolved") {
    return;
  }
  return { table: fact.column.value.table.declarationName, name: fact.column.value.propertyName };
}

function empty(known = true): PredicateObservation {
  return { known, byId: new Set(), owners: new Set(), columnOwners: new Set(), edges: new Set() };
}

function combine(parts: readonly PredicateObservation[], alternative: boolean): PredicateObservation {
  const common = (select: (part: PredicateObservation) => ReadonlySet<string>): ReadonlySet<string> => {
    const values = new Set(parts.flatMap((part) => [...select(part)]));
    return alternative ? new Set([...values].filter((value) => parts.every((part) => select(part).has(value)))) : values;
  };
  return {
    known: parts.every((part) => part.known),
    byId: new Set(parts.flatMap((part) => [...part.byId])),
    owners: common((part) => part.owners),
    columnOwners: new Set(parts.flatMap((part) => [...part.columnOwners])),
    edges: common((part) => part.edges),
  };
}

function soleDeclaration(identifier: Identifier): Node | undefined {
  const declarations = identifier.getSymbol()?.getDeclarations() ?? [];
  return declarations.length === 1 ? declarations[0] : undefined;
}

// A destructured name belongs to the parameter or variable whose pattern declares it.
function bindingSite(declaration: Node | undefined): Node | undefined {
  let site = declaration;
  while (site !== undefined && (N.isBindingElement(site) || N.isObjectBindingPattern(site) || N.isArrayBindingPattern(site))) {
    site = site.getParentOrThrow();
  }
  return site;
}

// A const binding holds its initializer, or the iterable of its `for…of`; a mutable binding holds anything.
function bindingSource(site: Node | undefined): Node | undefined {
  const list = site?.getParentIfKind(SyntaxKind.VariableDeclarationList);
  if (site === undefined || !N.isVariableDeclaration(site) || list?.getDeclarationKind() !== VariableDeclarationKind.Const) {
    return;
  }
  const loop = list.getParent();
  const source = N.isForOfStatement(loop) ? loop.getExpression() : site.getInitializer();
  return source === undefined ? undefined : unwrapTarget(source);
}

// Awaited rows and non-Drizzle call results are data; a Drizzle alias is a table and a builder chain is a subquery.
function callValue(source: Node): OwnerValue {
  if (N.isAwaitExpression(source)) {
    return "plain";
  }
  if (!N.isCallExpression(source) || drizzleExportOf(source.getExpression()) !== undefined) {
    return "column";
  }
  return callsAround(source).some((call) => QUERY_ROOTS.has(literalMemberAccess(call.getExpression())?.name ?? "")) ? "opaque" : "plain";
}

// One further hop only: a local root is data as a parameter or as a const holder of fetched data.
function rootData(root: Identifier): boolean {
  const site = bindingSite(soleDeclaration(root));
  const source = bindingSource(site);
  const fetched = source !== undefined && (N.isAwaitExpression(source) || N.isCallExpression(source)) && callValue(source) === "plain";
  return fetched || (site !== undefined && N.isParameterDeclaration(site));
}

/** What a binding holds, judged only by its declaring syntax; `operand` marks a name used directly as the owner value. */
function bindingValue(declaration: Node | undefined, operand: boolean): OwnerValue {
  const site = bindingSite(declaration);
  const source = bindingSource(site);
  if (site !== undefined && N.isParameterDeclaration(site)) {
    return "plain";
  }
  if (source === undefined) {
    return "opaque";
  }
  if (N.isStringLiteral(source) || N.isNoSubstitutionTemplateLiteral(source) || N.isNumericLiteral(source)) {
    return "plain";
  }
  if (N.isAwaitExpression(source) || N.isCallExpression(source)) {
    // A name bound straight from a computation is unanalyzed; a destructured or member-read holder of its result is data.
    return operand && site === declaration ? "opaque" : callValue(source);
  }
  const root = memberRoot(source);
  if (root === undefined) {
    return "opaque";
  }
  if (imported(root)) {
    return "column";
  }
  return rootData(root) ? "plain" : "opaque";
}

function memberRoot(node: Node): Identifier | undefined {
  const value = unwrapTarget(node);
  if (N.isIdentifier(value)) {
    return value;
  }
  const access = literalMemberAccess(value);
  return access === undefined ? undefined : memberRoot(access.receiver);
}

// Owner terms are syntax only (D328): this classifies the value's shape, never its runtime type or identity.
function ownerValue(operand: Node, scope: DirectOwnerReadScope): OwnerValue {
  const value = unwrapTarget(operand);
  if (column(value, scope) !== undefined) {
    return "column";
  }
  if (N.isIdentifier(value)) {
    return bindingValue(soleDeclaration(value), true);
  }
  if (N.isArrayLiteralExpression(value)) {
    return worstValue(value.getElements().map((element) => ownerValue(element, scope)));
  }
  return memberValue(value);
}

function worstValue(values: readonly OwnerValue[]): OwnerValue {
  if (values.includes("opaque")) {
    return "opaque";
  }
  return values.includes("column") ? "column" : "plain";
}

// Imported members that are not resolved schema columns are foreign values; local data members are plain.
function memberValue(value: Node): OwnerValue {
  const access = literalMemberAccess(value);
  if (access === undefined) {
    return N.isStringLiteral(value) || N.isNoSubstitutionTemplateLiteral(value) ? "plain" : "opaque";
  }
  const root = memberRoot(access.receiver);
  if (root === undefined) {
    return N.isThisExpression(unwrapTarget(access.receiver)) ? "plain" : "opaque";
  }
  return imported(root) ? "opaque" : bindingValue(soleDeclaration(root), false);
}

function predicate(node: Node, scope: DirectOwnerReadScope): PredicateObservation {
  const value = unwrapTarget(node);
  if (N.isConditionalExpression(value)) {
    return combine([predicate(value.getWhenTrue(), scope), predicate(value.getWhenFalse(), scope)], true);
  }
  if (!N.isCallExpression(value)) {
    return empty(false);
  }
  const operator = drizzleExportOf(value.getExpression());
  if (operator === "and" || operator === "or") {
    return combine(
      value.getArguments().map((argument) => predicate(argument, scope)),
      operator === "or",
    );
  }
  if (operator === undefined || !FILTERS.has(operator)) {
    return empty(false);
  }
  return atomicPredicate(value, operator, scope);
}

function columnRestriction(
  selected: DirectColumn | undefined,
  other: DirectColumn | undefined,
  operand: Node | undefined,
  scope: DirectOwnerReadScope,
): PredicateObservation {
  if (selected === undefined || operand === undefined) {
    return empty();
  }
  if (selected.name === "ownerId") {
    const value = other === undefined ? ownerValue(operand, scope) : "column";
    if (value === "opaque") {
      return empty(false);
    }
    return value === "column" ? { ...empty(), columnOwners: new Set([selected.table]) } : { ...empty(), owners: new Set([selected.table]) };
  }
  return other === undefined && selected.name === "id" ? { ...empty(), byId: new Set([selected.table]) } : empty();
}

function atomicPredicate(value: CallExpression, operator: string, scope: DirectOwnerReadScope): PredicateObservation {
  const [left, right] = value.getArguments();
  return operandPredicate(left, right, operator, scope);
}

function operandPredicate(left: Node | undefined, right: Node | undefined, operator: string, scope: DirectOwnerReadScope): PredicateObservation {
  // A conditional operand owes the predicate on every branch, like an `or`.
  const leftChoice = left === undefined ? undefined : unwrapTarget(left);
  if (leftChoice !== undefined && N.isConditionalExpression(leftChoice)) {
    return combine(
      [leftChoice.getWhenTrue(), leftChoice.getWhenFalse()].map((branch) => operandPredicate(branch, right, operator, scope)),
      true,
    );
  }
  const rightChoice = right === undefined ? undefined : unwrapTarget(right);
  if (rightChoice !== undefined && N.isConditionalExpression(rightChoice)) {
    return combine(
      [rightChoice.getWhenTrue(), rightChoice.getWhenFalse()].map((branch) => operandPredicate(left, branch, operator, scope)),
      true,
    );
  }
  if ([left, right].some((side) => side !== undefined && (N.isCallExpression(unwrapTarget(side)) || N.isTaggedTemplateExpression(unwrapTarget(side))))) {
    return empty(false);
  }
  const a = column(left, scope);
  const b = column(right, scope);
  if (a === undefined && b === undefined) {
    return empty(false);
  }
  const restrictions =
    operator === "eq" || operator === "inArray"
      ? combine([columnRestriction(a, b, right, scope), ...(operator === "eq" ? [columnRestriction(b, a, left, scope)] : [])], false)
      : empty();
  if (operator !== "eq" || a === undefined || b === undefined) {
    return restrictions;
  }
  const edges = (
    [
      [a, b],
      [b, a],
    ] as const
  )
    .map(([child, parent]) => `${foreignKeyColumnKey(child.table, child.name)}${EDGE_ARROW}${foreignKeyColumnKey(parent.table, parent.name)}`)
    .filter((edge) => scope.fkEdges.has(edge));
  return { ...restrictions, edges: new Set(edges) };
}

/** Demand only direct read methods and import-bound predicate columns, never all application references. */
export function directOwnerReadInputs(anchors: readonly ReadAnchor[]): DirectOwnerReadInputs {
  const calls = anchors.filter((anchor) => anchor.kind !== "relational" && imported(anchor.table)).map((anchor) => anchor.call);
  return { calls, columns: [...new Set(calls.flatMap(callsAround).flatMap(predicateColumns))] };
}

function joinedOwnerRead(table: string, facts: PredicateObservation, scope: DirectOwnerReadScope): DirectOwnerRead {
  const incoming = [...facts.edges].filter((edge) => edge.endsWith(`${EDGE_ARROW}${foreignKeyColumnKey(table, "id")}`));
  if (incoming.length === 0) {
    return observed(UNJOINED);
  }
  const sources = incoming.map((edge) => edge.slice(0, edge.indexOf(".")));
  if (sources.every((source) => scope.derivedParents.get(source)?.size === 1 && scope.derivedParents.get(source)?.has(table) === true)) {
    return observed(SATELLITE);
  }
  return sources.some((source) => facts.owners.has(source)) ? observed() : unknown("direct FK exists but its source authority is not established locally");
}

/** A single lexical chain; unsupported continuations never request callable or invocation evidence. */
export function directOwnerRead(anchor: ReadAnchor, scope: DirectOwnerReadScope): DirectOwnerRead {
  if (anchor.kind === "relational") {
    return unknown("relational configuration is outside direct SELECT analysis");
  }
  if (!imported(anchor.table)) {
    return unknown("table is not a directly imported schema binding");
  }
  const evidence = scope.calls.get(anchor.call);
  if (evidence?.mode !== "called-member") {
    throw new Error("direct owner-read native method evidence is unavailable");
  }
  const native = classifyDrizzleClientCall(evidence.member);
  if (native.kind === "foreign") {
    return observed();
  }
  if (native.kind === "unresolved") {
    return unknown("read method has no resolved native Drizzle declaration");
  }
  const table = evidence.table?.kind === "resolved" ? evidence.table.value.identity.declarationName : undefined;
  if (table === undefined) {
    return unknown("table is not a directly imported schema binding");
  }
  const calls = callsAround(anchor.call);
  const gap = statementGap(calls);
  if (gap !== undefined) {
    return unknown(gap);
  }
  const filters = calls.flatMap((call) => filterArguments(call, anchor));
  const facts = combine(
    filters.map((filter) => predicate(filter, scope)),
    false,
  );
  if (!facts.known) {
    return unknown("filter contains a helper, SQL carrier, alias or unsupported predicate");
  }
  if (!scope.ownerTables.has(table) || facts.owners.has(table)) {
    return observed();
  }
  const joined = calls.some((call) => JOINS.has(literalMemberAccess(call.getExpression())?.name ?? ""));
  return unscopedOwnedRead({ anchor, table, joined }, facts, scope);
}

interface OwnedRead {
  readonly anchor: ReadAnchor;
  readonly table: string;
  readonly joined: boolean;
}

function unscopedOwnedRead({ anchor, table, joined }: OwnedRead, facts: PredicateObservation, scope: DirectOwnerReadScope): DirectOwnerRead {
  if (facts.columnOwners.has(table)) {
    return unknown("owner term is valued by a column; its §2b class pin is outside the direct check");
  }
  if (anchor.kind === "join") {
    return joinedOwnerRead(table, facts, scope);
  }
  if (joined && !facts.byId.has(table)) {
    return unknown("joined read scope is outside the direct naked-ID check");
  }
  // A rejecting compare of the fetched row's owner within this function body is the accepted post-fetch scope.
  return observed(facts.byId.has(table) && !hasPostFetchFilter(anchor.call, enclosingFn(anchor.call)) ? NAKED : undefined);
}
