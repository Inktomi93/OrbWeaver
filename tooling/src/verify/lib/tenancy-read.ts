// Shared readers for the TENANCY gates (`owner-scoped-reads` + `owner-scoped-writes` + `owner-scoped-upserts`)
// — ONE home for the questions all three must answer IDENTICALLY: what does this drizzle statement PREDICATE
// on (`.where` for a read/write, the `onConflictDoUpdate` config for an upsert), and (for `owner-scoped-reads`)
// whether a POST-FETCH filter relates the fetched row's owner to the caller's. Re-spelled per gate they would
// drift on exactly the question they exist to enforce (`tooling/src/floor/code-facts/schema-read.ts` is the same call
// for what a `sqliteTable(...)` DECLARES). The (a)-class table set they cross this with is derived by
// `lib/tenancy-scope.ts` from `TABLE_SCOPING` in `@orb/db/tenancy`. Homed here rather than in the gate file because these readers walk BOUNDED
// node subtrees (`getDescendantsOfKind` on a function body / statement / expression, never a `SourceFile`) —
// exactly the shape `verify/lib` exists for; the static `gate:contract` census globs only `gates/*.ts` and
// cannot see past the receiver to tell a bounded node walk from a repository one.
import type { DrizzleTableRef } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import { resolveDrizzleTableRefs } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import { resolveModuleMemberOrigin, resolveStableExpression, staticMemberAccess } from "@orb/tooling/floor/code-facts/reference-fact";
import type { VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readMemberUses } from "../../floor/code-facts/drizzle-column-reads.ts";
import { callsDrizzleOperator } from "../../floor/code-facts/drizzle-operators.ts";
import { readDrizzlePredicate } from "../../floor/code-facts/drizzle-predicate.ts";
import { readPredicateArgument, readPredicateColumn } from "../../floor/code-facts/drizzle-predicate-argument.ts";
import type { DrizzlePredicate } from "../../floor/code-facts/drizzle-predicate-contract.ts";
import { readReturnOccurrences, resultReferenceDepths } from "../../floor/code-facts/drizzle-row-flow.ts";
import { readFollowingBuilderChain } from "../../floor/code-facts/drizzle-statement.ts";
import {
  DRIZZLE_CONFLICT_VERBS,
  DRIZZLE_RETURNING_VERB,
  DRIZZLE_UPSERT_SET_KEY,
  DRIZZLE_UPSERT_VERB,
  DRIZZLE_VALUES_VERB,
  DRIZZLE_WHERE_VERB,
  DRIZZLE_WRITE_ARGUMENT_VERBS,
} from "../../floor/code-facts/drizzle-vocabulary.ts";
import { enclosingFn, readFunctionBodyNodes } from "../../floor/code-facts/function-context.ts";
import { MEMBER_ACCESS_KINDS } from "../../floor/code-facts/reference-fact-contract.ts";
import type { SchemaTableIndex, SystemWriteProof, SystemWriteValue, TableRef, TableTarget } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { combineSystemWriteValues, systemWritePayload, systemWriteValue } from "./tenancy-system-write.ts";

const OWNER_COL = "ownerId";
const EQ_OPERATOR = "eq";
const IN_ARRAY_OPERATOR = "inArray";
const IS_NULL_OPERATOR = "isNull";
const SCHEMA_DIR = "/packages/db/src/schema/";
const CALLER_OWNER_BINDING_RE = /^(?:caller|(?:caller|owner|user)[A-Za-z0-9_]*Id)$/u;

/** The chained calls only a drizzle statement can carry. The DISCRIMINATOR for the unresolvable arm: an
 *  identifier the resolver cannot trace is a finding only when the statement is provably a drizzle write —
 *  `cache.delete(key)` / `hash.update(bytes)` are the SAME AST shape, and 72 of them live in
 *  `packages/server/src` (measured 2026-08-27), every one of them chain-free. */
const DRIZZLE_WRITE_CHAIN: ReadonlySet<string> = new Set([
  ...DRIZZLE_WRITE_ARGUMENT_VERBS,
  DRIZZLE_RETURNING_VERB,
  DRIZZLE_WHERE_VERB,
  ...DRIZZLE_CONFLICT_VERBS,
]);

/** Does raw SQL text name any schema table by its SQL name? Only a constant that names none reads none. Raw SQL
 *  text carries no declaration, so this stays a text judgment; SQLite resolves identifiers case-insensitively,
 *  so the match does too. */
function namesSchemaTable(text: string, index: SchemaTableIndex): boolean {
  return [...index.identBySqlName.keys()].some((sqlName) => new RegExp(String.raw`\b${RegExp.escape(sqlName)}\b`, "iu").test(text));
}

/** The declared schema identifier one floor answer names, or undefined when it names none. */
function identOfRef(ref: DrizzleTableRef, index: SchemaTableIndex): string | undefined {
  if (ref.kind === "table") {
    return ref.declaration.getName();
  }
  if (ref.kind === "imported") {
    return index.idents.has(ref.name) ? ref.name : undefined;
  }
  return ref.kind === "sql-name" ? index.identBySqlName.get(ref.sqlName) : undefined;
}

/** The schema tables a reference can name, through the ONE table resolver `pnpm ast columns` shares
 *  (`floor/code-facts/drizzle-table-ref.ts`): declarations, renaming and namespace imports, drizzle `alias()`/
 *  `aliasedTable()`, both arms of a conditional, a subquery's inner select, and the drizzle type's table name. */
export function tableRefsOf(node: Node, index: SchemaTableIndex, nativeReferences?: readonly DrizzleTableRef[]): readonly TableRef[] {
  const isTable = (declaration: VariableDeclaration): boolean =>
    index.idents.has(declaration.getName()) && declaration.getSourceFile().getFilePath().includes(SCHEMA_DIR);
  return (nativeReferences ?? resolveDrizzleTableRefs(node, isTable)).map((ref): TableRef => {
    if (ref.kind === "subquery") {
      return { kind: "subquery", select: ref.select };
    }
    if (ref.kind === "raw-sql") {
      return ref.interpolates || namesSchemaTable(ref.text, index) ? { kind: "unresolved" } : { kind: "no-table" };
    }
    const ident = identOfRef(ref, index);
    return ident === undefined ? { kind: "unresolved" } : { kind: "table", ident };
  });
}

/** Classify a drizzle table argument against `classTableIdents` — the CLASS THE CALLER IS ASKING ABOUT (the
 *  three `owner-scoped-*` gates pass the `ownerId` set; `membership-write-fan` passes the `membership` set,
 *  #1734). The full index is the denominator that separates "reads fine, simply not that class" from "I could
 *  not read this at all": an argument any arm of which the resolver cannot name is `unresolvable`. */
export function tableTargetOf(node: Node | undefined, classTableIdents: ReadonlySet<string>, index: SchemaTableIndex): TableTarget | undefined {
  if (node === undefined || Node.isLiteralLike(node)) {
    return;
  }
  const refs = tableRefsOf(node, index);
  const ident = node.getText();
  if (refs.some((ref) => ref.kind === "unresolved")) {
    return { kind: "unresolvable", ident };
  }
  return refs.some((ref) => ref.kind === "table" && classTableIdents.has(ref.ident)) ? { kind: "in-class", ident } : { kind: "other-table" };
}

/** The ONE declared table a reference names, or undefined when it names none or more than one. */
export function declaredTableOf(node: Node, index: SchemaTableIndex, nativeReferences?: readonly DrizzleTableRef[]): string | undefined {
  const refs = tableRefsOf(node, index, nativeReferences);
  const [first] = refs;
  return refs.length === 1 && first?.kind === "table" ? first.ident : undefined;
}

/** Is the statement this table anchor starts provably a DRIZZLE write? The fence the unresolvable arm needs:
 *  `db.delete(T)` and `cache.delete(key)` are one AST shape, so only the chained drizzle-only builders
 *  (`.set` / `.values` / `.where` / `.returning` / `.onConflict…`) can tell them apart without a type graph
 *  the pure-AST harness does not build. DECLARED LIMIT: a CHAIN-FREE statement (`db.delete(T);` unbounded)
 *  is indistinguishable from a `Map.delete` and stays out of the unresolvable arm. */
export function isDrizzleWriteStatement(anchor: Node): boolean {
  return readFollowingBuilderChain(anchor).calls.some((call) => {
    const callee = staticMemberAccess(call.getExpression());
    return callee !== undefined && DRIZZLE_WRITE_CHAIN.has(callee.name);
  });
}

/** Immutable aliases retain receiver identity; SQL aliases remain distinct call values, not their base table. */
export function sameReadReceiver(left: Node, right: Node | string): boolean {
  if (typeof right === "string") {
    return left.getText() === right;
  }
  if (left.getProject() !== right.getProject()) {
    return false;
  }
  const identity = (receiver: Node): { readonly node: Node; readonly member: string } | undefined => {
    const origin = resolveModuleMemberOrigin(receiver);
    if (origin.kind === "resolved" && origin.value.canonical.kind === "external-door") {
      return { node: origin.value.canonical.declaration, member: [origin.value.exportedName, ...origin.value.memberPath].join(".") };
    }
    const declaration =
      origin.kind === "resolved" && origin.value.canonical.kind === "project" && origin.value.memberPath.length === 0
        ? origin.value.canonical.declaration
        : undefined;
    const name = declaration?.isKind(SyntaxKind.VariableDeclaration) === true ? declaration.getNameNode() : receiver;
    const fact = resolveStableExpression(name);
    if (fact.kind === "resolved") {
      return { node: fact.value, member: "" };
    }
    return fact.reason === "dynamic" || (fact.reason === "missing" && fact.node.isKind(SyntaxKind.Parameter)) ? { node: fact.node, member: "" } : undefined;
  };
  const a = identity(left);
  const b = identity(right);
  return a !== undefined && b !== undefined && a.node.compilerNode === b.node.compilerNode && a.member === b.member;
}

/** The declared schema tables a reference can name, through the same floor resolver `tableTargetOf` uses. */
export function declaredTablesOf(node: Node, index: SchemaTableIndex): ReadonlySet<string> {
  return new Set(tableRefsOf(node, index).flatMap((ref) => (ref.kind === "table" ? [ref.ident] : [])));
}

interface PredicateSite {
  readonly node: Node;
  readonly bindings: ReadonlyMap<Node, Node>;
}

interface ColumnRead {
  readonly name: string;
  readonly access: Node;
  readonly receiver: Node;
  readonly bindings: ReadonlyMap<Node, Node>;
}

/** The value a binding was declared from, on the floor binding fact's terms: a stable value, or the call or
 *  computed expression a `dynamic` binding holds. */
function boundInitializer(identifier: Node): Node | undefined {
  const fact = resolveStableExpression(identifier);
  if (fact.kind === "resolved") {
    return fact.value === identifier ? undefined : fact.value;
  }
  const computed = fact.reason === "dynamic" && fact.node !== identifier && !Node.isVariableDeclaration(fact.node) && !Node.isParameterDeclaration(fact.node);
  return computed ? fact.node : undefined;
}

/** Where a predicate can name a column: its own syntax, and every term the floor predicate fact reaches through a
 *  bound predicate or a helper's return, with the helper's parameter bindings. The floor leaves a bound SQL value
 *  opaque unless every use of it is provably native; this accusing reader still reads its initializer, because a
 *  value that can change after binding can lose a column but not prove one. */
function predicateSites(predicate: Node): readonly PredicateSite[] {
  const terms = (fact: DrizzlePredicate): readonly PredicateSite[] => {
    if (fact.kind === "and" || fact.kind === "or" || fact.kind === "choice") {
      return fact.terms.flatMap(terms);
    }
    if (fact.kind === "empty") {
      return [];
    }
    const site = { node: fact.node, bindings: fact.kind === "leaf" ? fact.bindings : new Map<Node, Node>() };
    const initializer = fact.kind === "unresolved" && Node.isIdentifier(fact.node) ? boundInitializer(fact.node) : undefined;
    return initializer === undefined ? [site] : [site, { node: initializer, bindings: site.bindings }];
  };
  return [{ node: predicate, bindings: new Map() }, ...terms(readDrizzlePredicate(predicate))];
}

/** The column reads a site names: its written member accesses, and a call operand bound to a column elsewhere. */
function columnReadsOf({ node, bindings }: PredicateSite): readonly ColumnRead[] {
  const descendants = MEMBER_ACCESS_KINDS.flatMap((kind) => node.getDescendantsOfKind(kind));
  const written = MEMBER_ACCESS_KINDS.some((kind) => node.isKind(kind)) ? [node, ...descendants] : descendants;
  const bound = Node.isCallExpression(node)
    ? node.getArguments().flatMap((argument) => {
        const column = readPredicateColumn(argument, bindings);
        return column.kind === "resolved" ? [unwrapExpression(column.value)] : [];
      })
    : [];
  return [...written, ...bound].flatMap((candidate) => {
    const read = staticMemberAccess(candidate);
    return read === undefined ? [] : [{ name: read.name, access: candidate, receiver: read.receiver, bindings }];
  });
}

/** The tables a column read's receiver names, after mapping a helper parameter to the argument it was handed. */
function receiverTables({ receiver, bindings }: ColumnRead, index: SchemaTableIndex): readonly TableRef[] {
  const actual = readPredicateArgument(receiver, bindings);
  return tableRefsOf(actual.kind === "resolved" ? actual.value : receiver, index);
}

/** The accusing half: does this predicate read `column` on any of `tables`? Judged on the receiver's declared
 *  table, so an alias, a namespace, a bracket key or a bound predicate cannot hide the read. */
export function readsTableColumn(predicate: Node, tables: ReadonlySet<string>, column: string, index: SchemaTableIndex): boolean {
  return predicateSites(predicate).some((site) =>
    columnReadsOf(site).some((read) => read.name === column && receiverTables(read, index).some((ref) => ref.kind === "table" && tables.has(ref.ident))),
  );
}

/** Does this receiver name its table through declarations and imports only, the way the floor resolver walks it,
 *  with no call on the way? A drizzle `alias()` or `aliasedTable()` resolves to its base table there but is its
 *  own SQL row source, and any other call computes the table at run time. */
function namesTableDirectly(node: Node, index: SchemaTableIndex, active: ReadonlySet<object> = new Set()): boolean {
  const value = unwrapExpression(node);
  if (active.has(value.compilerNode)) {
    return false;
  }
  const next = new Set(active).add(value.compilerNode);
  if (Node.isConditionalExpression(value)) {
    return namesTableDirectly(value.getWhenTrue(), index, next) && namesTableDirectly(value.getWhenFalse(), index, next);
  }
  if (Node.isPropertyAccessExpression(value) || Node.isElementAccessExpression(value)) {
    return true;
  }
  if (!Node.isIdentifier(value)) {
    return false;
  }
  return value.getDefinitionNodes().every((definition) => {
    if (Node.isImportSpecifier(definition)) {
      return true;
    }
    if (!Node.isVariableDeclaration(definition)) {
      return false;
    }
    if (index.idents.has(definition.getName()) && definition.getSourceFile().getFilePath().includes(SCHEMA_DIR)) {
      return true;
    }
    const initializer = definition.getInitializer();
    return initializer !== undefined && namesTableDirectly(initializer, index, next);
  });
}

/** The owner column one acquittal asks about: `column` on the one declared `table`. */
interface OwnerColumn {
  readonly table: string;
  readonly column: string;
  readonly index: SchemaTableIndex;
}

/** Does this operand name the owner column, every arm of its receiver naming that one declared table directly? A
 *  conditional or unreadable receiver and an aliased copy of the table prove nothing about the written row. */
function namesOwnerColumn(operand: Node, bindings: ReadonlyMap<Node, Node>, owner: OwnerColumn): boolean {
  const source = readPredicateColumn(operand, bindings);
  const access = source.kind === "resolved" ? unwrapExpression(source.value) : operand;
  const member = staticMemberAccess(access);
  if (member?.name !== owner.column) {
    return false;
  }
  const read = { name: member.name, access, receiver: member.receiver, bindings };
  const actual = readPredicateArgument(read.receiver, bindings);
  const refs = receiverTables(read, owner.index);
  return (
    namesTableDirectly(actual.kind === "resolved" ? actual.value : read.receiver, owner.index) &&
    refs.length > 0 &&
    refs.every((ref) => ref.kind === "table" && ref.ident === owner.table)
  );
}

/** Does an operand read a column of any declared table? Then it is a row's value, never the caller's. */
function readsSchemaColumn(operand: Node, bindings: ReadonlyMap<Node, Node>, index: SchemaTableIndex): boolean {
  const source = readPredicateColumn(operand, bindings);
  const node = source.kind === "resolved" ? source.value : operand;
  return columnReadsOf({ node, bindings }).some((read) => receiverTables(read, index).some((ref) => ref.kind === "table"));
}

/** An owner term: `eq` of the owner column against a value that reads no table column, either way round. The
 *  value's provenance is the caller's control flow, which no structural reader proves. The read view admits
 *  `isNull` to select ownerless rows; writeOwnerProof judges system-write data separately from ownership. */
function isOwnerTerm(fact: DrizzlePredicate, owner: OwnerColumn, includeSystemRows = true): boolean {
  if (fact.kind !== "leaf" || !Node.isCallExpression(fact.node)) {
    return false;
  }
  const call = fact.node;
  const operands = call.getArguments();
  const [left, right] = operands;
  if (callsDrizzleOperator(call, IS_NULL_OPERATOR) && left !== undefined && operands.length === 1) {
    return includeSystemRows && namesOwnerColumn(left, fact.bindings, owner);
  }
  if (!callsDrizzleOperator(call, EQ_OPERATOR) || left === undefined || right === undefined || operands.length !== 2) {
    return false;
  }
  const scopes = (own: Node, value: Node): boolean => namesOwnerColumn(own, fact.bindings, owner) && !readsSchemaColumn(value, fact.bindings, owner.index);
  return scopes(left, right) || scopes(right, left);
}

/** Whether `holds` is true of a term every match of the predicate must satisfy: any term of an `and`, every arm of
 *  a choice. A term under `or`, an optional term and an unreadable term constrain nothing. */
function holdsConjunctively(fact: DrizzlePredicate, holds: (term: DrizzlePredicate) => boolean): boolean {
  if (fact.kind === "and") {
    return fact.terms.some((term) => holdsConjunctively(term, holds));
  }
  if (fact.kind === "choice") {
    return fact.terms.every((term) => holdsConjunctively(term, holds));
  }
  return holds(fact);
}

/** The acquitting half: does this predicate constrain every row it matches to its owner? Only an owner term in a
 *  conjunctive position does (`isOwnerTerm`); an owner column inside `or`, `ne`, `isNotNull`, a self-comparison or a
 *  nested select reads the column without scoping the row. */
export function predicatesTableColumn(predicate: Node, table: string, column: string, index: SchemaTableIndex): boolean {
  const owner = { table, column, index };
  return holdsConjunctively(readDrizzlePredicate(predicate), (term) => isOwnerTerm(term, owner));
}

function isSystemOwnerTerm(fact: DrizzlePredicate, owner: OwnerColumn): boolean {
  if (fact.kind !== "leaf" || !Node.isCallExpression(fact.node) || !callsDrizzleOperator(fact.node, IS_NULL_OPERATOR)) {
    return false;
  }
  const [operand] = fact.node.getArguments();
  return fact.node.getArguments().length === 1 && operand !== undefined && namesOwnerColumn(operand, fact.bindings, owner);
}

function systemLeafValue(fact: DrizzlePredicate, owner: OwnerColumn): SystemWriteValue {
  if (isSystemOwnerTerm(fact, owner)) {
    return "constant";
  }
  if (fact.kind !== "leaf" || !Node.isCallExpression(fact.node)) {
    return "unknown";
  }
  if (fact.bindings.size > 0) {
    return "unknown";
  }
  const equality = callsDrizzleOperator(fact.node, EQ_OPERATOR);
  if (!(equality || callsDrizzleOperator(fact.node, IN_ARRAY_OPERATOR))) {
    return "unknown";
  }
  const [left, right] = fact.node.getArguments();
  if (left === undefined || right === undefined || fact.node.getArguments().length !== 2) {
    return "unknown";
  }
  const leftColumn = readsSchemaColumn(left, fact.bindings, owner.index);
  const rightColumn = readsSchemaColumn(right, fact.bindings, owner.index);
  if (leftColumn === rightColumn || !(leftColumn || equality)) {
    return "unknown";
  }
  const value = leftColumn ? right : left;
  const actual = readPredicateArgument(value, fact.bindings);
  return actual.kind === "resolved" ? systemWriteValue(actual.value) : "unknown";
}

function systemPredicateValues(fact: DrizzlePredicate, owner: OwnerColumn): readonly SystemWriteValue[] {
  if (fact.kind === "and" || fact.kind === "or" || fact.kind === "choice") {
    return fact.terms.flatMap((term) => systemPredicateValues(term, owner));
  }
  return [systemLeafValue(fact, owner)];
}

function systemStatementValues(anchor: Node): readonly SystemWriteValue[] {
  const calls = readFollowingBuilderChain(anchor).calls;
  const inputs = calls.flatMap((call) => {
    const member = staticMemberAccess(call.getExpression());
    return member !== undefined && DRIZZLE_WRITE_ARGUMENT_VERBS.some((verb) => verb === member.name) ? call.getArguments().slice(0, 1) : [];
  });
  const values = inputs.map((input) => systemWritePayload(input));
  const config = upsertConfigOf(anchor);
  if (config === undefined) {
    return values;
  }
  const set = config.asKind(SyntaxKind.ObjectLiteralExpression)?.getProperty(DRIZZLE_UPSERT_SET_KEY)?.asKind(SyntaxKind.PropertyAssignment)?.getInitializer();
  const inserted = calls.some((call) => staticMemberAccess(call.getExpression())?.name === DRIZZLE_VALUES_VERB);
  return [...values, set === undefined ? "unknown" : systemWritePayload(set), ...(inserted ? [] : ["unknown" as const])];
}

/** Write ownership does not follow from null ownership. Only authored system data acquits; direct caller
 *  data is a finding, while calls, callback projections and injected metadata remain explicit uncertainty. */
export function writeOwnerProof(anchor: Node, predicate: Node, table: string, index: SchemaTableIndex): SystemWriteProof {
  const owner = { table, column: OWNER_COL, index };
  const fact = readDrizzlePredicate(predicate);
  if (holdsConjunctively(fact, (term) => isOwnerTerm(term, owner, false))) {
    return { kind: "supported", scoped: true, callerDriven: false };
  }
  if (!holdsConjunctively(fact, (term) => isSystemOwnerTerm(term, owner))) {
    return { kind: "supported", scoped: false, callerDriven: false };
  }
  const provenance = combineSystemWriteValues([...systemPredicateValues(fact, owner), ...systemStatementValues(anchor)]);
  if (provenance === "unknown") {
    return {
      kind: "unknown",
      scoped: false,
      callerDriven: false,
      reason: "system-write-provenance: keys, content or timestamp metadata are outside the bounded authored-data proof",
    };
  }
  return { kind: "supported", scoped: provenance === "constant", callerDriven: provenance === "caller" };
}

/** Does an upsert's conflict target, one column or an array of them, list `column` on exactly `table`? */
export function targetsTableColumn(target: Node, table: string, column: string, index: SchemaTableIndex): boolean {
  const value = unwrapExpression(target);
  const columns = Node.isArrayLiteralExpression(value) ? value.getElements() : [value];
  return columns.some((element) => namesOwnerColumn(element, new Map(), { table, column, index }));
}

/** The `.where(…)` argument of the statement this table anchor starts, or undefined (NO where clause at all —
 *  which means a LIST read on the read side and an UNBOUNDED write on the write side; the two halves judge
 *  that differently, so this reader only reports the absence). */
export function whereArgOf(anchor: Node): Node | undefined {
  const whereCall = readFollowingBuilderChain(anchor).calls.find((call) => staticMemberAccess(call.getExpression())?.name === DRIZZLE_WHERE_VERB);
  return whereCall?.getArguments()[0];
}

/** The `onConflictDoUpdate({ … })` CONFIG of the statement this `insert(T)` anchor starts, or undefined —
 *  which means a plain insert or an `onConflictDoNothing`, neither of which can overwrite an existing row.
 *  This is the upsert's answer to `whereArgOf`: an upsert's collision is decided by the conflict TARGET (a
 *  unique index); only `setWhere` constrains DO UPDATE. `targetWhere` selects a partial conflict index,
 *  never an owner guard, and a `.where` on the statement does not constrain the update arm either. */
export function upsertConfigOf(anchor: Node): Node | undefined {
  const upsertCall = readFollowingBuilderChain(anchor).calls.find((call) => staticMemberAccess(call.getExpression())?.name === DRIZZLE_UPSERT_VERB);
  return upsertCall?.getArguments()[0];
}

/** Owner-member attribution is a consumer judgment over real member/lineage observations. */
function resultOwnerReads(side: Node, resultDecl: Node): readonly Node[] {
  return readMemberUses(side).flatMap((fact) =>
    fact.kind === "resolved" && fact.value.name === OWNER_COL && resultReferenceDepths(fact.value.receiver, resultDecl).some((depth) => depth <= 1)
      ? [fact.value.access]
      : [],
  );
}

function expressionDerivesFromReadResult(expression: Node, resultDecl: Node): boolean {
  return resultReferenceDepths(unwrapExpression(expression), resultDecl).some((depth) => depth <= 1);
}

/** Does this expression name the caller-side owner identity rather than another fetched/ambient row? The
 *  accepted forms are an explicit local binding (`ownerId`, `caller`, `callerUserId`) or the authenticated
 *  identity projection (`principal.userId` / `caller.userId`). An arbitrary `other.ownerId` is not an
 *  authority relationship merely because it shares the column name. */
function isCallerOwnerBinding(side: Node, resultDecl: Node): boolean {
  const value = unwrapExpression(side);
  if (expressionDerivesFromReadResult(value, resultDecl)) {
    return false;
  }
  if (value.isKind(SyntaxKind.Identifier)) {
    return CALLER_OWNER_BINDING_RE.test(value.getText());
  }
  if (!value.isKind(SyntaxKind.PropertyAccessExpression) || value.getName() !== "userId") {
    return false;
  }
  const principalText = value.getExpression().getText();
  return principalText === "principal" || principalText === "caller" || principalText.endsWith(".principal") || principalText.endsWith(".caller");
}

/** A mismatch branch protects egress only when it definitely leaves without returning the fetched result.
 *  This deliberately recognises the guard-clause register (`throw`, `return null`, or a block ending in one)
 *  and rejects a logging-only branch or `return row`. */
function rejectsFetchedResult(statement: Node, resultDecl: Node): boolean {
  if (statement.isKind(SyntaxKind.ThrowStatement)) {
    return true;
  }
  if (statement.isKind(SyntaxKind.ReturnStatement)) {
    const expression = statement.getExpression();
    return expression === undefined || !expressionDerivesFromReadResult(expression, resultDecl);
  }
  if (!statement.isKind(SyntaxKind.Block)) {
    return false;
  }
  const outerFn = enclosingFn(statement);
  const leaksOnAnyBranch = readReturnOccurrences(statement).some((ret) => {
    if (enclosingFn(ret) !== outerFn) {
      return false;
    }
    const expression = ret.getExpression();
    return expression !== undefined && expressionDerivesFromReadResult(expression, resultDecl);
  });
  if (leaksOnAnyBranch) {
    return false;
  }
  const last = statement.getStatements().at(-1);
  return last !== undefined && rejectsFetchedResult(last, resultDecl);
}

/** Walk a `!==` mismatch through parentheses / OR clauses to the `if` it makes true. `&&` is intentionally
 *  excluded: a second false conjunct would let a mismatched row continue to egress. */
function rejectingGuardOf(comparison: Node, resultDecl: Node): boolean {
  let condition: Node = comparison;
  for (;;) {
    const parent = condition.getParent();
    if (parent?.isKind(SyntaxKind.ParenthesizedExpression) === true) {
      condition = parent;
      continue;
    }
    if (parent?.isKind(SyntaxKind.BinaryExpression) === true && parent.getOperatorToken().getKind() === SyntaxKind.BarBarToken) {
      condition = parent;
      continue;
    }
    if (parent?.isKind(SyntaxKind.IfStatement) !== true || parent.getExpression() !== condition) {
      return false;
    }
    return rejectsFetchedResult(parent.getThenStatement(), resultDecl);
  }
}

/** A verifier may return the ownership relationship itself instead of loading the row for egress. Keep
 *  this arm deliberately narrow: the exact `===` comparison must be the return expression. */
function returnsOwnerVerdict(comparison: Node): boolean {
  let expression = comparison;
  while (expression.getParent()?.isKind(SyntaxKind.ParenthesizedExpression) === true) {
    expression = expression.getParentOrThrow();
  }
  return expression.getParent()?.isKind(SyntaxKind.ReturnStatement) === true;
}

/** The POST-FETCH-FILTER arm `owner-scoped-reads` accepts as an alternative to putting the owner in the
 *  WHERE: the enclosing function must relate the exact fetched result's `.ownerId` to the caller's authorized
 *  owner binding. A row-loading function rejects a mismatch; a boolean verifier may return the exact equality
 *  relationship directly. */
export function hasPostFetchFilter(read: Node, fn: Node | undefined): boolean {
  if (fn === undefined) {
    return false;
  }
  const resultDecl = read.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  if (resultDecl === undefined) {
    return false;
  }
  return readFunctionBodyNodes(fn)
    .filter(Node.isBinaryExpression)
    .some((b) => {
      const op = b.getOperatorToken().getKind();
      if (op !== SyntaxKind.ExclamationEqualsEqualsToken && op !== SyntaxKind.EqualsEqualsEqualsToken) {
        return false;
      }
      const left = b.getLeft();
      const right = b.getRight();
      const leftIsResultOwner = resultOwnerReads(left, resultDecl).length > 0;
      const rightIsResultOwner = resultOwnerReads(right, resultDecl).length > 0;
      if (leftIsResultOwner === rightIsResultOwner) {
        return false;
      }
      const callerOwner = leftIsResultOwner ? right : left;
      if (!isCallerOwnerBinding(callerOwner, resultDecl)) {
        return false;
      }
      return op === SyntaxKind.EqualsEqualsEqualsToken ? returnsOwnerVerdict(b) : rejectingGuardOf(b, resultDecl);
    });
}
