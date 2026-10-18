// Direct owner-read syntax is deliberately not callable provenance or SQL containment (D328).

import { drizzleExportOf } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import { literalMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import { unwrapTarget } from "@orb/tooling/floor/code-facts/reference-fact-alias";
import type { AsExpression, CallExpression, Node } from "ts-morph";
import { Node as N, SyntaxKind } from "ts-morph";
import { RELATIONAL_VERBS } from "../../floor/code-facts/drizzle-operators.ts";
import { enclosingFn } from "../../floor/code-facts/function-context.ts";
import { resolveTypeIdentityChain } from "../../floor/code-facts/type-member-origin.ts";
import type { DirectOwnerRead, DirectOwnerReadInputs, DirectOwnerReadScope, ReadAnchor } from "../contract/tenancy.ts";
import { classifyDrizzleClientCall } from "./drizzle-client-call.ts";
import { EDGE_ARROW, foreignKeyColumnKey } from "./tenancy-scope.ts";

const JOINS = new Set(["innerJoin", "leftJoin", "rightJoin", "fullJoin", "crossJoin"]);
const FINISHES = new Set(["all", "get", "execute", "run"]);
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
  readonly edges: ReadonlySet<string>;
}

function unknown(reason: string): DirectOwnerRead {
  return { kind: "unknown", reason };
}
function observed(finding?: string): DirectOwnerRead {
  return { kind: "supported", ...(finding === undefined ? {} : { finding }) };
}

// Only import-bound table expressions reach the shared resolver; local factories and aliases stay unknown.
function imported(node: Node): boolean {
  const value = unwrapTarget(node);
  if (N.isIdentifier(value)) {
    return value.getSymbol()?.getDeclarations().some(N.isImportSpecifier) === true;
  }
  const member = literalMemberAccess(value);
  return member !== undefined && N.isIdentifier(member.receiver) && member.receiver.getSymbol()?.getDeclarations().some(N.isNamespaceImport) === true;
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
  return { known, byId: new Set(), owners: new Set(), edges: new Set() };
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
    edges: common((part) => part.edges),
  };
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
  if (value.getArguments().some((argument) => N.isCallExpression(unwrapTarget(argument)) || N.isTaggedTemplateExpression(unwrapTarget(argument)))) {
    return empty(false);
  }
  return atomicPredicate(value, operator, scope);
}

function columnRestriction(selected: DirectColumn | undefined, other: DirectColumn | undefined, operand: Node | undefined): PredicateObservation {
  if (selected === undefined || other !== undefined || operand === undefined) {
    return empty();
  }
  return {
    known: true,
    byId: new Set(selected.name === "id" ? [selected.table] : []),
    owners: new Set(selected.name === "ownerId" ? [selected.table] : []),
    edges: new Set(),
  };
}

function atomicPredicate(value: CallExpression, operator: string, scope: DirectOwnerReadScope): PredicateObservation {
  const [left, right] = value.getArguments();
  const a = column(left, scope);
  const b = column(right, scope);
  if (a === undefined && b === undefined) {
    return empty(false);
  }
  const restrictions =
    operator === "eq" || operator === "inArray"
      ? combine([columnRestriction(a, b, right), ...(operator === "eq" ? [columnRestriction(b, a, left)] : [])], false)
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

function callsAround(anchor: CallExpression): readonly CallExpression[] {
  const before: CallExpression[] = [];
  let current: Node = anchor;
  for (;;) {
    const member = N.isCallExpression(current) ? literalMemberAccess(current.getExpression()) : undefined;
    if (member === undefined || !N.isCallExpression(member.receiver)) {
      break;
    }
    before.unshift(member.receiver);
    current = member.receiver;
  }
  const after: CallExpression[] = [];
  current = anchor;
  for (;;) {
    const access = current.getParent();
    const call = access?.getParent();
    if (access === undefined || !N.isCallExpression(call) || literalMemberAccess(access)?.receiver !== current || call.getExpression() !== access) {
      break;
    }
    after.push(call);
    current = call;
  }
  return [...before, anchor, ...after];
}

function predicateColumns(step: CallExpression): readonly Node[] {
  const name = literalMemberAccess(step.getExpression())?.name;
  if (name !== "where" && !JOINS.has(name ?? "")) {
    return [];
  }
  return step
    .getArguments()
    .flatMap((argument) => [
      argument,
      ...argument.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression),
      ...argument.getDescendantsOfKind(SyntaxKind.ElementAccessExpression),
    ])
    .filter((candidate) => {
      const access = literalMemberAccess(candidate);
      return access !== undefined && imported(access.receiver);
    });
}

/** Demand only direct read methods and import-bound predicate columns, never all application references. */
export function directOwnerReadInputs(anchors: readonly ReadAnchor[]): DirectOwnerReadInputs {
  const calls = anchors.filter((anchor) => anchor.kind !== "relational" && imported(anchor.table)).map((anchor) => anchor.call);
  return { calls, columns: [...new Set(calls.flatMap(callsAround).flatMap(predicateColumns))] };
}

function consumed(top: CallExpression, method: string | undefined): boolean {
  const parent = top.getParent();
  if (N.isAwaitExpression(parent) || FINISHES.has(method ?? "")) {
    return true;
  }
  const fn = top.getFirstAncestor((node) => N.isFunctionLikeDeclaration(node));
  if (!((N.isFunctionDeclaration(fn) || N.isArrowFunction(fn) || N.isFunctionExpression(fn) || N.isMethodDeclaration(fn)) && fn.isAsync())) {
    return false;
  }
  return N.isReturnStatement(parent) || parent === fn;
}

function statementGap(calls: readonly CallExpression[]): string | undefined {
  const methods = calls.map((call) => literalMemberAccess(call.getExpression())?.name);
  if (!(methods.includes("select") || methods.includes("selectDistinct"))) {
    return "read chain has no direct SELECT root";
  }
  if (methods.includes("$dynamic") || methods.filter((method) => method === "where").length > 1) {
    return "dynamic or repeated WHERE is outside direct analysis";
  }
  const top = calls.at(-1);
  return top === undefined || !consumed(top, methods.at(-1)) ? "builder is stored, returned editable, or handed to another consumer" : undefined;
}

function filterArguments(call: CallExpression, anchor: ReadAnchor): readonly Node[] {
  const name = literalMemberAccess(call.getExpression())?.name;
  const filters = name === "where" || name === "innerJoin" || (call === anchor.call && anchor.kind === "join");
  const argument = call.getArguments()[JOINS.has(name ?? "") ? 1 : 0];
  return filters && argument !== undefined ? [argument] : [];
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
  const joins = calls.filter((call) => JOINS.has(literalMemberAccess(call.getExpression())?.name ?? ""));
  if (anchor.kind === "join") {
    return joinedOwnerRead(table, facts, scope);
  }
  if (joins.length > 0 && !facts.byId.has(table)) {
    return unknown("joined read scope is outside the direct naked-ID check");
  }
  return observed(facts.byId.has(table) ? NAKED : undefined);
}

const EVERY_OWNER_HOME = "/packages/contracts/src/workloads/execution.ts";
const RUNNER_HOME = "/packages/server/src/domain/workloads/engine/runner.ts";
const ESTIMATE_HOME = "/packages/server/src/domain/workloads/verbs/estimate-model-calls.ts";

const EVERY_OWNER_AUTHORITIES = ["EveryOwnerRun", "EveryOwnerEstimate"] as const;
type EveryOwnerAuthority = (typeof EVERY_OWNER_AUTHORITIES)[number];

/** Named aliases resolve through the canonical floor; nullable and structural lookalikes are not authority. */
function everyOwnerAuthority(node: Node): EveryOwnerAuthority | undefined {
  const origin = resolveTypeIdentityChain(node);
  return origin.kind === "unresolved"
    ? undefined
    : EVERY_OWNER_AUTHORITIES.find((name) =>
        origin.value.some(
          (identity) =>
            identity.name === name && identity.declarations.every((declaration) => declaration.getSourceFile().getFilePath().endsWith(EVERY_OWNER_HOME)),
        ),
      );
}

/** Assertion targets can carry authority inside a scope, array or data member; direct read admission remains separate. */
function assertionAuthorities(assertion: AsExpression): readonly EveryOwnerAuthority[] {
  const annotation = assertion.getTypeNode();
  if (annotation === undefined) {
    return [];
  }
  const references = [annotation, ...annotation.getDescendantsOfKind(SyntaxKind.TypeReference)];
  const origins = references.flatMap((reference) => {
    const chain = resolveTypeIdentityChain(reference);
    return chain.kind === "resolved" ? chain.value : [];
  });
  return EVERY_OWNER_AUTHORITIES.filter((authority) =>
    origins.some(
      (origin) =>
        (origin.name === authority || origin.name === (authority === "EveryOwnerRun" ? "WorkloadRunScope" : "WorkloadEstimateScope")) &&
        origin.declarations.every((declaration) => declaration.getSourceFile().getFilePath().endsWith(EVERY_OWNER_HOME)),
    ),
  );
}

/** A token in an optional, defaulted or union parameter does not prove that this invocation holds it. */
export function hasEveryOwnerAuthority(node: Node): boolean {
  const fn = enclosingFn(node);
  if (
    fn === undefined ||
    !(
      fn.isKind(SyntaxKind.FunctionDeclaration) ||
      fn.isKind(SyntaxKind.ArrowFunction) ||
      fn.isKind(SyntaxKind.FunctionExpression) ||
      fn.isKind(SyntaxKind.MethodDeclaration)
    )
  ) {
    return false;
  }
  return fn
    .getParameters()
    .some((parameter) => !parameter.hasQuestionToken() && parameter.getInitializer() === undefined && everyOwnerAuthority(parameter) !== undefined);
}

/** These casts are the nominal boundary, never a caller-accessible mint. */
function authorizedAuthorityMint(assertion: AsExpression, authority: EveryOwnerAuthority): boolean {
  const fn = enclosingFn(assertion);
  const choice = assertion.getFirstAncestorByKind(SyntaxKind.ConditionalExpression);
  if (
    fn === undefined ||
    !fn.isKind(SyntaxKind.FunctionDeclaration) ||
    choice === undefined ||
    assertion.getStart() < choice.getWhenTrue().getStart() ||
    assertion.getEnd() > choice.getWhenTrue().getEnd()
  ) {
    return false;
  }
  const path = assertion.getSourceFile().getFilePath();
  const condition = choice.getCondition().getText();
  const admitted = {
    [EVERY_OWNER_AUTHORITIES[0]]: path.endsWith(RUNNER_HOME) && fn.getName() === "buildRunContext" && condition === "row.ownerId === null",
    [EVERY_OWNER_AUTHORITIES[1]]:
      path.endsWith(ESTIMATE_HOME) &&
      ((fn.getName() === "estimateModelCalls" && condition === "ownerId === null") ||
        (fn.getName() === "estimateRetryModelCalls" && condition === "original.ownerId === null")),
  } satisfies Record<EveryOwnerAuthority, boolean>;
  return admitted[authority];
}

/** Only directly named canonical token/scope assertions participate; arbitrary data-type inference is not claimed. */
export function hasUnauthorizedEveryOwnerMint(assertion: AsExpression): boolean {
  return assertionAuthorities(assertion).some((authority) => !authorizedAuthorityMint(assertion, authority));
}
