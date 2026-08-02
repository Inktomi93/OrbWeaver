// Shared readers for the TENANCY gates (`owner-scoped-reads` + `owner-scoped-writes`) — ONE home for the two
// questions both halves must answer IDENTICALLY: what does this drizzle statement PREDICATE on, and which
// function does a two-sided `@owner-scope…-ok:` marker hang off. Re-spelled per gate they would drift on
// exactly the question they exist to enforce (`schema-read.ts` is the same call for what a `sqliteTable(...)`
// DECLARES). The (a)-class table set they cross this with is derived by `gates/table-scoping-class.ts`.
import type { CallExpression, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";

const LEADING_SLASH_RE = /^\/+/u;

/** Absolute ts-morph path → the repo-relative jump-link path (conformance mini-projects are rooted at `/repo`). */
export function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path.replace(LEADING_SLASH_RE, "") : path.slice(idx + 1);
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
export interface MarkedFunction {
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
