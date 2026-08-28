// Shared readers for the TENANCY gates (`owner-scoped-reads` + `owner-scoped-writes` + `owner-scoped-upserts`)
// — ONE home for the questions all three must answer IDENTICALLY: what does this drizzle statement PREDICATE
// on (`.where` for a read/write, the `onConflictDoUpdate` config for an upsert), and which function does a
// two-sided `@owner-scope…-ok:` marker hang off. Re-spelled per gate they would drift on exactly the question
// they exist to enforce (`tooling/src/_shared/schema-read.ts` is the same call for what a `sqliteTable(...)` DECLARES). The
// (a)-class table set they cross this with is derived by `gates/table-scoping-class.ts`.
import type { CallExpression, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { TableTarget } from "../contract/tenancy.ts";

const LEADING_SLASH_RE = /^\/+/u;
const MAX_ALIAS_DEPTH = 8;
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

/** Absolute ts-morph path → the repo-relative jump-link path (conformance mini-projects are rooted at `/repo`). */
function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(idx + 1);
}

/** Classify a drizzle table argument: trace it ONCE against the FULL schema table set, then read its class
 *  off the (a)-class set. The full set is the denominator that separates "reads fine, simply not (a)-class"
 *  from "I could not read this at all" — without it every non-(a) write would look identical to a bypass. */
export function tableTargetOf(node: Node | undefined, ownerTableIdents: ReadonlySet<string>, schemaTableIdents: ReadonlySet<string>): TableTarget | undefined {
  if (node?.isKind(SyntaxKind.Identifier) !== true) {
    return;
  }
  const traced = tracedTable(node, schemaTableIdents, new Set(), 0);
  if (traced === undefined) {
    return { kind: "unresolvable", ident: node.getText() };
  }
  return ownerTableIdents.has(traced) ? { kind: "owner-scoped", ident: node.getText() } : { kind: "other-table" };
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
  const properties = predicate.isKind(SyntaxKind.PropertyAccessExpression)
    ? [predicate, ...predicate.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)]
    : predicate.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  return properties.some(
    (property) => property.getName() === column && property.getExpression().isKind(SyntaxKind.Identifier) && property.getExpression().getText() === tableIdent,
  );
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
  return new RegExp(String.raw`\b${tableIdent}\.id\b`, "u").test(whereText);
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

function fnName(fn: Node): string {
  if (fn.isKind(SyntaxKind.FunctionDeclaration) || fn.isKind(SyntaxKind.MethodDeclaration)) {
    return fn.getName() ?? "(anonymous)";
  }
  const parent = fn.getParent();
  return parent?.isKind(SyntaxKind.VariableDeclaration) === true ? parent.getName() : "(anonymous)";
}

function leadingMarker(n: Node, marker: RegExp): boolean {
  return n.getLeadingCommentRanges().some((r) => marker.test(r.getText()));
}

/** A function carries the marker when it sits in the function's OWN leading comments, or in those of the
 *  variable statement declaring it. Deliberately NOT "anywhere in the body": a marker attached to the
 *  function is the reviewable unit, and a body-wide text match would let an inner arrow inherit a promise its
 *  enclosing helper was granted (and would make the stale arm fire on phantom keys). */
function carriesMarker(fn: Node, marker: RegExp): boolean {
  if (leadingMarker(fn, marker)) {
    return true;
  }
  const decl = fn.getParent();
  if (decl?.isKind(SyntaxKind.VariableDeclaration) !== true) {
    return false;
  }
  const stmt = decl.getFirstAncestorByKind(SyntaxKind.VariableStatement);
  return stmt !== undefined && leadingMarker(stmt, marker);
}

/** One marked function, keyed `<repo-rel file>#<function name>` — the SAME key both halves of a two-sided
 *  marker arm use (recorded here, marked used at the violation site), so they can never drift. */
interface MarkedFunction {
  readonly key: string;
  readonly fn: string;
  readonly file: string;
}

/** Every function in this file carrying the marker — the stale arm's left-hand side. */
export function markedFunctions(sf: SourceFile, marker: RegExp): MarkedFunction[] {
  if (!marker.test(sf.getFullText())) {
    return [];
  }
  const rel = repoRel(sf.getFilePath());
  return sf
    .getDescendants()
    .filter((n) => isFnish(n) && carriesMarker(n, marker))
    .map((n) => ({ key: `${rel}#${fnName(n)}`, fn: fnName(n), file: rel }));
}

/** The key of the nearest ancestor function (innermost first) carrying the marker, or undefined when none
 *  does — a statement inside a `.map()` inherits the exported helper's marker, which is where a reviewer
 *  writes it. */
export function markerKeyFor(node: Node, sf: SourceFile, marker: RegExp): string | undefined {
  let cur = enclosingFn(node);
  while (cur !== undefined && !carriesMarker(cur, marker)) {
    cur = cur.getFirstAncestor(isFnish);
  }
  return cur === undefined ? undefined : `${repoRel(sf.getFilePath())}#${fnName(cur)}`;
}
