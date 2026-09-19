// Shared readers for the TENANCY gates (`owner-scoped-reads` + `owner-scoped-writes` + `owner-scoped-upserts`)
// — ONE home for the questions all three must answer IDENTICALLY: what does this drizzle statement PREDICATE
// on (`.where` for a read/write, the `onConflictDoUpdate` config for an upsert), and (for `owner-scoped-reads`)
// whether a POST-FETCH filter relates the fetched row's owner to the caller's. Re-spelled per gate they would
// drift on exactly the question they exist to enforce (`tooling/src/_shared/schema-read.ts` is the same call
// for what a `sqliteTable(...)` DECLARES). The (a)-class table set they cross this with is derived by
// `gates/table-scoping-class.ts`. Homed here rather than in the gate file because these readers walk BOUNDED
// node subtrees (`getDescendantsOfKind` on a function body / statement / expression, never a `SourceFile`) —
// exactly the shape `verify/lib` exists for; the static `gate:contract` census globs only `gates/*.ts` and
// cannot see past the receiver to tell a bounded node walk from a repository one.
import type { CallExpression, Identifier, Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { TableTarget } from "../contract/tenancy.ts";
import { unwrapExpression } from "./ast-read.ts";
import { namespaceImportSpecifier, readMemberAccess } from "./symbol-reference.ts";

const OWNER_COL = "ownerId";
const CALLER_OWNER_BINDING_RE = /^(?:caller|(?:caller|owner|user)[A-Za-z0-9_]*Id)$/u;

const MAX_ALIAS_DEPTH = 8;
/** Every node kind a member read can wear — the `lib/symbol-reference.ts` family, spelled here as a local
 *  tuple because these readers collect DESCENDANTS by kind rather than subscribing a policy visitor. */
const MEMBER_KINDS = [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression] as const;
/** The chained calls only a drizzle statement can carry. The DISCRIMINATOR for the unresolvable arm: an
 *  identifier the resolver cannot trace is a finding only when the statement is provably a drizzle write —
 *  `cache.delete(key)` / `hash.update(bytes)` are the SAME AST shape, and 72 of them live in
 *  `packages/server/src` (measured 2026-08-27), every one of them chain-free. */
const DRIZZLE_WRITE_CHAIN = new Set(["set", "values", "returning", "where", "onConflictDoUpdate", "onConflictDoNothing"]);

/** Same-file variable aliases of this identifier (`const t = characters` / `let t = characters`).
 *  DECLARATION KIND IS IRRELEVANT — it says how the binding may be REASSIGNED, never what it names, and
 *  keying on `const` alone let `let table = characters` / `var table = characters` walk both write halves
 *  straight past the tenancy check (#769; measured through the real descriptors with a const control). */
function localAliasInitializers(identifier: Node): readonly Node[] {
  return (identifier.getSymbol()?.getDeclarations() ?? []).flatMap((declaration) => {
    if (declaration.getSourceFile() !== identifier.getSourceFile() || !declaration.isKind(SyntaxKind.VariableDeclaration)) {
      return [];
    }
    const initializer = declaration.getInitializer();
    return initializer?.isKind(SyntaxKind.Identifier) === true ? [initializer] : [];
  });
}

/** The DECLARED table name this identifier traces to, or undefined when the walk cannot reach one. ONE walk
 *  answers both questions the write halves ask ("is it (a)-class" and "is it readable at all") — resolving
 *  twice, once per set, doubles the language-service work on every write in the tree and cost ~12s of the
 *  whole-corpus conformance budget when it was written that way. */
function tracedTable(identifier: Node, tableIdents: ReadonlySet<string>, seen: Set<number>, depth: number): string | undefined {
  if (!identifier.isKind(SyntaxKind.Identifier) || depth > MAX_ALIAS_DEPTH || seen.has(identifier.getStart())) {
    return;
  }
  seen.add(identifier.getStart());
  const own = identifier.getText();
  if (tableIdents.has(own)) {
    return own;
  }
  const defined = identifier.getDefinitions().find((definition) => tableIdents.has(definition.getName()));
  if (defined !== undefined) {
    return defined.getName();
  }
  for (const declaration of identifier.getSymbol()?.getDeclarations() ?? []) {
    if (declaration.isKind(SyntaxKind.ImportSpecifier) && tableIdents.has(declaration.getNameNode().getText())) {
      return declaration.getNameNode().getText();
    }
  }
  // A binding declares at most one initializer here, so mapping the (0-or-1-element) alias list and taking
  // the first hit costs nothing and keeps every path an expression return.
  return localAliasInitializers(identifier)
    .map((initializer) => tracedTable(initializer, tableIdents, seen, depth + 1))
    .find((traced) => traced !== undefined);
}

/** The EXPORTED TABLE NAME a namespace-spelled reference names — a member read off a binding introduced by
 *  `import * as schema`, whatever the module. A namespace import produces NO ImportSpecifier and its member
 *  read is not an Identifier, so the identifier-keyed trace below never saw one: a namespaced table
 *  classified as "not a table argument at all" and the write walked past the tenancy check entirely (#2199 —
 *  the `owner-scoped-writes` / `owner-scoped-upserts` namespace arms in the spelling-twins ledger). The member NAME
 *  is the declared export, which is the same string the schema-derived ident sets carry, so no alias trace is
 *  owed here — a namespace member cannot be re-bound the way a local const can. */
function namespacedTableName(node: Node): string | undefined {
  const read = readMemberAccess(node);
  return read !== undefined && namespaceImportSpecifier(read.receiver) !== undefined ? read.name : undefined;
}

/** Classify a drizzle table argument: trace it ONCE against the FULL schema table set, then read whether it
 *  is in `classTableIdents` — the CLASS THE CALLER IS ASKING ABOUT (the three `owner-scoped-*` gates pass
 *  the `ownerId` set; `membership-write-fan` passes the `membership` set, #1734). The full set is the
 *  denominator that separates "reads fine, simply not that class" from "I could not read this at all" —
 *  without it every out-of-class write would look identical to a bypass. */
export function tableTargetOf(node: Node | undefined, classTableIdents: ReadonlySet<string>, schemaTableIdents: ReadonlySet<string>): TableTarget | undefined {
  if (node === undefined) {
    return;
  }
  const namespaced = namespacedTableName(node);
  if (namespaced !== undefined) {
    return classTableIdents.has(namespaced) ? { kind: "in-class", ident: node.getText() } : { kind: "other-table" };
  }
  if (!node.isKind(SyntaxKind.Identifier)) {
    return;
  }
  const traced = tracedTable(node, schemaTableIdents, new Set(), 0);
  if (traced === undefined) {
    return { kind: "unresolvable", ident: node.getText() };
  }
  return classTableIdents.has(traced) ? { kind: "in-class", ident: node.getText() } : { kind: "other-table" };
}

/** Is the statement this table anchor starts provably a DRIZZLE write? The fence the unresolvable arm needs:
 *  `db.delete(T)` and `cache.delete(key)` are one AST shape, so only the chained drizzle-only builders
 *  (`.set` / `.values` / `.where` / `.returning` / `.onConflict…`) can tell them apart without a type graph
 *  the pure-AST harness does not build. DECLARED LIMIT: a CHAIN-FREE statement (`db.delete(T);` unbounded)
 *  is indistinguishable from a `Map.delete` and stays out of the unresolvable arm. */
export function isDrizzleWriteStatement(anchor: Node): boolean {
  return chainCalls(anchor).some((call) => {
    const callee = call.getExpression();
    return callee.isKind(SyntaxKind.PropertyAccessExpression) && DRIZZLE_WRITE_CHAIN.has(callee.getName());
  });
}

/** Does this predicate name the exact local table binding's column? Text elsewhere in the expression is not
 *  evidence: only a property access rooted at the write target can scope that target. */
export function predicatesTableColumn(predicate: Node, tableIdent: string, column: string): boolean {
  const descendants = MEMBER_KINDS.flatMap((kind) => predicate.getDescendantsOfKind(kind));
  const candidates = MEMBER_KINDS.some((kind) => predicate.isKind(kind)) ? [predicate, ...descendants] : descendants;
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
    } else if (!(parent.isKind(SyntaxKind.PropertyAccessExpression) || parent.isKind(SyntaxKind.AwaitExpression))) {
      return out;
    }
    cur = parent;
  }
}

/** The `.where(…)` argument of the statement this table anchor starts, or undefined (NO where clause at all —
 *  which means a LIST read on the read side and an UNBOUNDED write on the write side; the two halves judge
 *  that differently, so this reader only reports the absence). */
export function whereArgOf(anchor: Node): Node | undefined {
  const whereCall = chainCalls(anchor).find((call) => {
    const callee = call.getExpression();
    return callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === "where";
  });
  return whereCall?.getArguments()[0];
}

/** The `onConflictDoUpdate({ … })` CONFIG of the statement this `insert(T)` anchor starts, or undefined —
 *  which means a plain insert or an `onConflictDoNothing`, neither of which can overwrite an existing row.
 *  This is the upsert's answer to `whereArgOf`: an upsert's collision is decided by the conflict TARGET (a
 *  unique index) and the optional `targetWhere`/`setWhere`, never by a `.where` on the statement. */
export function upsertConfigOf(anchor: Node): Node | undefined {
  const upsertCall = chainCalls(anchor).find((call) => {
    const callee = call.getExpression();
    return callee.isKind(SyntaxKind.PropertyAccessExpression) && callee.getName() === "onConflictDoUpdate";
  });
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
