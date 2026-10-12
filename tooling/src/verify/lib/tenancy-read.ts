// Shared readers for the TENANCY gates (`owner-scoped-reads` + `owner-scoped-writes` + `owner-scoped-upserts`)
// — ONE home for the questions all three must answer IDENTICALLY: what does this drizzle statement PREDICATE
// on (`.where` for a read/write, the `onConflictDoUpdate` config for an upsert), and (for `owner-scoped-reads`)
// whether a POST-FETCH filter relates the fetched row's owner to the caller's. Re-spelled per gate they would
// drift on exactly the question they exist to enforce (`tooling/src/floor/code-facts/schema-read.ts` is the same call
// for what a `sqliteTable(...)` DECLARES). The (a)-class table set they cross this with is derived by
// `gates/table-scoping-class.ts`. Homed here rather than in the gate file because these readers walk BOUNDED
// node subtrees (`getDescendantsOfKind` on a function body / statement / expression, never a `SourceFile`) —
// exactly the shape `verify/lib` exists for; the static `gate:contract` census globs only `gates/*.ts` and
// cannot see past the receiver to tell a bounded node walk from a repository one.
import type { DrizzleTableRef } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import { resolveDrizzleTableRefs } from "@orb/tooling/floor/code-facts/drizzle-table-ref";
import type { CallExpression, Identifier, VariableDeclaration } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { ReadStatement, SchemaTableIndex, TableRef, TableTarget } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { MEMBER_ACCESS_KINDS, readMemberAccess, referencesModuleExport } from "./symbol-reference.ts";

const OWNER_COL = "ownerId";
const DRIZZLE_MODULE_PREFIX = "drizzle-orm";
const SCHEMA_DIR = "/packages/db/src/schema/";
const WHERE_VERB = "where";
const INNER_JOIN_VERB = "innerJoin";
const MAX_BUILDER_HOPS = 3;
const CALLER_OWNER_BINDING_RE = /^(?:caller|(?:caller|owner|user)[A-Za-z0-9_]*Id)$/u;

/** The chained calls only a drizzle statement can carry. The DISCRIMINATOR for the unresolvable arm: an
 *  identifier the resolver cannot trace is a finding only when the statement is provably a drizzle write —
 *  `cache.delete(key)` / `hash.update(bytes)` are the SAME AST shape, and 72 of them live in
 *  `packages/server/src` (measured 2026-08-27), every one of them chain-free. */
const DRIZZLE_WRITE_CHAIN = new Set(["set", "values", "returning", "where", "onConflictDoUpdate", "onConflictDoNothing"]);

/** Is this call's callee the drizzle-orm export `name`, by its import (named or namespace), never its spelling? */
export function callsDrizzleOperator(call: CallExpression, name: string): boolean {
  return referencesModuleExport(call.getExpression(), name, (specifier) => specifier.startsWith(DRIZZLE_MODULE_PREFIX));
}

/** Does raw SQL text name any schema table by its SQL name? Only a constant that names none reads none. */
function namesSchemaTable(text: string, index: SchemaTableIndex): boolean {
  return [...index.identBySqlName.keys()].some((sqlName) => new RegExp(String.raw`\b${sqlName}\b`, "u").test(text));
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
export function tableRefsOf(node: Node, index: SchemaTableIndex): readonly TableRef[] {
  const isTable = (declaration: VariableDeclaration): boolean =>
    index.idents.has(declaration.getName()) && declaration.getSourceFile().getFilePath().includes(SCHEMA_DIR);
  return resolveDrizzleTableRefs(node, isTable).map((ref): TableRef => {
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
export function declaredTableOf(node: Node, index: SchemaTableIndex): string | undefined {
  const refs = tableRefsOf(node, index);
  const [first] = refs;
  return refs.length === 1 && first?.kind === "table" ? first.ident : undefined;
}

/** Is the statement this table anchor starts provably a DRIZZLE write? The fence the unresolvable arm needs:
 *  `db.delete(T)` and `cache.delete(key)` are one AST shape, so only the chained drizzle-only builders
 *  (`.set` / `.values` / `.where` / `.returning` / `.onConflict…`) can tell them apart without a type graph
 *  the pure-AST harness does not build. DECLARED LIMIT: a CHAIN-FREE statement (`db.delete(T);` unbounded)
 *  is indistinguishable from a `Map.delete` and stays out of the unresolvable arm. */
export function isDrizzleWriteStatement(anchor: Node): boolean {
  return chainCalls(anchor).some((call) => {
    const callee = readMemberAccess(call.getExpression());
    return callee !== undefined && DRIZZLE_WRITE_CHAIN.has(callee.name);
  });
}

/** Does this predicate name the exact local table binding's column? Text elsewhere in the expression is not
 *  evidence: only a property access rooted at the write target can scope that target. */
export function predicatesTableColumn(predicate: Node, tableIdent: string, column: string): boolean {
  const descendants = MEMBER_ACCESS_KINDS.flatMap((kind) => predicate.getDescendantsOfKind(kind));
  const candidates = MEMBER_ACCESS_KINDS.some((kind) => predicate.isKind(kind)) ? [predicate, ...descendants] : descendants;
  return candidates.some((candidate) => {
    const read = readMemberAccess(candidate);
    // The RECEIVER is compared by TEXT rather than required to be an Identifier (#2199): the write target is
    // whatever `tableTargetOf` named it, which for a namespace-spelled table is `schema.characters`. Requiring
    // an identifier receiver here would have ACQUITTED nothing and ACCUSED everything on the namespace side —
    // the owner predicate that is plainly there (`eq(schema.characters.ownerId, callerId)`) would read as
    // absent, turning a spelling into a false finding on code that is correctly scoped.
    return read !== undefined && read.name === column && read.receiver.getText() === tableIdent;
  });
}

/** Walk a drizzle method chain UP from its table anchor (`.from(T)` for a read, `db.update(T)`/`db.delete(T)`
 *  for a write), collecting the calls that follow it. */
function chainCalls(start: Node): CallExpression[] {
  const out: CallExpression[] = [];
  let cur: Node = start;
  for (;;) {
    const parent = cur.getParent();
    if (parent === undefined) {
      return out;
    }
    if (parent.isKind(SyntaxKind.CallExpression)) {
      out.push(parent);
    } else if (!(MEMBER_ACCESS_KINDS.some((kind) => parent.isKind(kind)) || parent.isKind(SyntaxKind.AwaitExpression))) {
      return out;
    }
    cur = parent;
  }
}

/** The `.where(…)` argument of the statement this table anchor starts, or undefined (NO where clause at all —
 *  which means a LIST read on the read side and an UNBOUNDED write on the write side; the two halves judge
 *  that differently, so this reader only reports the absence). */
export function whereArgOf(anchor: Node): Node | undefined {
  const whereCall = chainCalls(anchor).find((call) => readMemberAccess(call.getExpression())?.name === "where");
  return whereCall?.getArguments()[0];
}

/** The outermost node of the chain a table anchor starts: where `chainCalls` stops climbing. */
/** One step up a read's OWN builder chain: through a member access whose object is the current node, a call
 *  whose callee is, or an `await`. A select passed as an ARGUMENT (an `inArray(col, db.select()…)` subselect)
 *  is its own statement and never inherits the outer statement's predicates. */
function builderParent(cur: Node): Node | undefined {
  const parent = cur.getParent();
  if (parent === undefined) {
    return;
  }
  const continuesChain =
    parent.isKind(SyntaxKind.AwaitExpression) ||
    (parent.isKind(SyntaxKind.CallExpression) && parent.getExpression() === cur) ||
    (MEMBER_ACCESS_KINDS.some((kind) => parent.isKind(kind)) && parent.getFirstChild() === cur);
  return continuesChain ? parent : undefined;
}

/** The outermost node of a read's own builder chain, and the calls applied along the way. */
function builderChain(start: Node): { readonly top: Node; readonly calls: readonly CallExpression[] } {
  const calls: CallExpression[] = [];
  let cur: Node = start;
  for (let parent = builderParent(cur); parent !== undefined; parent = builderParent(cur)) {
    if (parent.isKind(SyntaxKind.CallExpression)) {
      calls.push(parent);
    }
    cur = parent;
  }
  return { top: cur, calls };
}

/** The binding an UNAWAITED builder chain is stored in (`const q = db.select().from(T)` or `q = q.where(…)`);
 *  an awaited chain is a result set, not a builder, and is never followed. */
function builderBinding(top: Node): Identifier | undefined {
  const parent = top.isKind(SyntaxKind.AwaitExpression) ? undefined : top.getParent();
  let target: Node | undefined;
  if (parent?.isKind(SyntaxKind.VariableDeclaration) === true && parent.getInitializer() === top) {
    target = parent.getNameNode();
  } else if (
    parent?.isKind(SyntaxKind.BinaryExpression) === true &&
    parent.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
    parent.getRight() === top
  ) {
    target = parent.getLeft();
  }
  return target?.isKind(SyntaxKind.Identifier) === true ? target : undefined;
}

/** The uses of a builder binding in its own function that continue the chain: a METHOD CALL on it (`q.where(…)`,
 *  `q.innerJoin(…)`). A column read off it (`sq.id`, a subquery's field) is a value, never a builder step. */
function builderUses(binding: Identifier): readonly Identifier[] {
  const symbol = binding.getSymbol()?.compilerSymbol;
  const scope = enclosingFn(binding) ?? binding.getSourceFile();
  return scope.getDescendantsOfKind(SyntaxKind.Identifier).filter((use) => {
    const access = use.getParent();
    const call = access.getParent();
    const isMethodCall =
      MEMBER_ACCESS_KINDS.some((kind) => access.isKind(kind)) &&
      access.getFirstChild() === use &&
      call?.isKind(SyntaxKind.CallExpression) === true &&
      call.getExpression() === access;
    return use !== binding && isMethodCall && symbol !== undefined && use.getSymbol()?.compilerSymbol === symbol;
  });
}

/** Every call a read statement applies after its anchor, following a split builder's binding in the same function. */
function statementCalls(anchor: Node, hops: number, seen: Set<Node>): readonly CallExpression[] {
  const chain = builderChain(anchor);
  const binding = builderBinding(chain.top);
  const followed = binding === undefined || hops >= MAX_BUILDER_HOPS ? [] : builderUses(binding).filter((use) => !seen.has(use));
  for (const use of followed) {
    seen.add(use);
  }
  return [...chain.calls, ...followed.flatMap((use) => statementCalls(use, hops + 1, seen))];
}

/** The predicates a read statement carries: every `.where` the chain (or its split builder) applies, and every
 *  inner join's ON. Several `.where` calls are several candidates for the effective filter, never a conjunction. */
export function readStatementOf(anchor: Node): ReadStatement {
  const calls = statementCalls(anchor, 0, new Set());
  const argumentsOf = (verb: string, position: number): readonly Node[] =>
    calls.flatMap((call) => {
      const argument = readMemberAccess(call.getExpression())?.name === verb ? call.getArguments()[position] : undefined;
      return argument === undefined ? [] : [argument];
    });
  return { wheres: argumentsOf(WHERE_VERB, 0), innerOns: argumentsOf(INNER_JOIN_VERB, 1) };
}

/** The `onConflictDoUpdate({ … })` CONFIG of the statement this `insert(T)` anchor starts, or undefined —
 *  which means a plain insert or an `onConflictDoNothing`, neither of which can overwrite an existing row.
 *  This is the upsert's answer to `whereArgOf`: an upsert's collision is decided by the conflict TARGET (a
 *  unique index) and the optional `targetWhere`/`setWhere`, never by a `.where` on the statement. */
export function upsertConfigOf(anchor: Node): Node | undefined {
  const upsertCall = chainCalls(anchor).find((call) => readMemberAccess(call.getExpression())?.name === "onConflictDoUpdate");
  return upsertCall?.getArguments()[0];
}

/** Does this WHERE constrain the table's OWN id — `eq(T.id, x)` or `inArray(T.id, ids)`? That is the shape
 *  whose answer is "whatever id the caller supplies, whoever owns it"; a predicate on any other column is a
 *  different (unenforced-here) question. */
export function predicatesOwnId(whereText: string, tableIdent: string): boolean {
  // The ident is ESCAPED because it is no longer always a bare word: a namespace-spelled target is
  // `schema.characters`, whose `.` would otherwise match any character (#2199).
  return new RegExp(String.raw`\b${tableIdent.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)}\.id\b`, "u").test(whereText);
}

function isFnish(n: Node): boolean {
  return (
    n.isKind(SyntaxKind.FunctionDeclaration) ||
    n.isKind(SyntaxKind.MethodDeclaration) ||
    n.isKind(SyntaxKind.ArrowFunction) ||
    n.isKind(SyntaxKind.FunctionExpression)
  );
}

/** The innermost enclosing function — the unit a post-fetch owner filter is resolved in. */
export function enclosingFn(node: Node): Node | undefined {
  return node.getFirstAncestor(isFnish);
}

/** True when `id` is the read result binding itself or a one-hop local alias initialized from it. */
function derivesFromReadResult(id: Identifier, resultDecl: Node): boolean {
  for (const def of id.getDefinitionNodes()) {
    if (def === resultDecl) {
      return true;
    }
    if (!def.isKind(SyntaxKind.VariableDeclaration)) {
      continue;
    }
    const init = def.getInitializer();
    if (init === undefined) {
      continue;
    }
    const sources = init.isKind(SyntaxKind.Identifier) ? [init] : init.getDescendantsOfKind(SyntaxKind.Identifier);
    if (sources.some((source) => source.getDefinitionNodes().includes(resultDecl))) {
      return true;
    }
  }
  return false;
}

/** The `.ownerId` reads on this side that derive from the exact query-result declaration. */
function resultOwnerReads(side: Node, resultDecl: Node): Node[] {
  const descendants = side.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  const accesses = side.isKind(SyntaxKind.PropertyAccessExpression) ? [side, ...descendants] : descendants;
  return accesses.filter((candidate) => {
    if (candidate.getName() !== OWNER_COL) {
      return false;
    }
    const receiver = candidate.getExpression();
    if (receiver.isKind(SyntaxKind.Identifier) && derivesFromReadResult(receiver, resultDecl)) {
      return true;
    }
    return receiver.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => derivesFromReadResult(id, resultDecl));
  });
}

function expressionDerivesFromReadResult(expression: Node, resultDecl: Node): boolean {
  const value = unwrapExpression(expression);
  if (value.isKind(SyntaxKind.Identifier) && derivesFromReadResult(value, resultDecl)) {
    return true;
  }
  return value.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => derivesFromReadResult(id, resultDecl));
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
  const leaksOnAnyBranch = statement.getDescendantsOfKind(SyntaxKind.ReturnStatement).some((ret) => {
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
  return fn.getDescendantsOfKind(SyntaxKind.BinaryExpression).some((b) => {
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
