// The shared subject reader for the `detached-work-traced` family: the DERIVED root-span vocabulary, and
// the per-node verdicts for fire-and-forget work whose failure is invisible.
//
// TWO INDEPENDENT CONSUMERS, which is what makes this a shared reader rather than one policy's private
// machinery wearing a `lib/` address (docs/law/gate-runtime-standardization.md §7 item 7): `gates/detached-work-traced.ts`
// (the ordinary occurrence policy, A1+A2) and `gates/detached-work-traced-health.ts` (the hard blindness
// tripwire, A4) both derive the opener vocabulary, and the split exists because the two arms differ in
// AUTHORITY — §12.1 allows exactly one authority per descriptor.
//
// WHY THE DERIVATION, NOT THE NAME. A boundary is an EXPORTED function of the tracing module that calls
// OTel's `startActiveSpan` with `root: true`, directly or through another derived boundary. `root: true` is
// the load-bearing bit — the per-requestId ring seals a bucket only when a PARENTLESS span lands, because a
// parented span dispatched from inside the request it outlives is dropped as a late orphan — so the family
// keys on the MECHANISM. Renaming `withRequestSpan` keeps it honest; deleting the detach makes the
// derivation empty and the health tripwire REDS.
//
// THE VERDICTS ARE PER-NODE, DELIVERED BY THE DISPATCHER, exactly as `lib/caught-failure.ts` hands
// `catchClauseSite`/`promiseAbsorberSite` a node: nothing here walks the repository on a policy's behalf.
// `deriveRootSpanOpeners` is the one exception and is scoped to the single tracing module it filters for.
//
// ANCHORS COME FROM `lib/caught-failure.ts`, NOT FROM A SECOND COPY. That module already owns the exact
// contract a waiver position must satisfy — an exact slice of the reported node's own text at a byte
// offset, rejecting any token carrying a paren, a newline or a solidus (`isAnchorableToken`), because the
// marker grammar's position group is `[^()\r\n]+` and `locateFinding` re-reads the slice out of
// COMMENT-BLANKED source. Its `calleeAnchorCandidates` / `firstAnchor` / `catchAnchor` (and the private
// `anchorWithin` they share) were module-private until this family needed them; they are now exported,
// which is the §12.4 reopening shape — a read with two or more independent consumers — rather than a new
// private reader. The payoff is that a site governed by BOTH policies reports the SAME position under
// both — `entry.promise` under each, never `entry.promise` there and a bare `promise` here.
import type { Block, CallExpression, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { DetachedWorkArm } from "../contract/detached-work.ts";
import { unwrapExpression } from "./ast-read.ts";
import type { CaughtFailureAnchor } from "./caught-failure.ts";
import { calleeAnchorCandidates, catchAnchor, firstAnchor } from "./caught-failure.ts";

export const TRACING_MODULE = "packages/server/src/foundation/observability/tracing.ts";
const OTEL_ROOT_OPENER = "startActiveSpan";

const PROMISE_LINKS: ReadonlySet<string> = new Set(["then", "catch", "finally"]);
/** Which ARGUMENT of a promise link is its rejection handler — `.catch(onRejected)` / `.then(_, onRejected)`.
 *  A Record, not a chain of ternaries: a new link spelling is one row. */
const REJECTION_HANDLER_ARG: ReadonlyMap<string, number> = new Map([
  ["catch", 0],
  ["then", 1],
]);
/** Bodies that throw the rejection away and do nothing else. `() => {}` is the empty-Block form. */
const DISCARD_BODIES: ReadonlySet<string> = new Set(["undefined", "null", "void 0"]);

/** A property read spelled EITHER way — `p.catch` and `p["catch"]` are the same read. Bracket access with a
 *  statically-resolvable string key is not a different language feature, and a dot-only reader is a silent
 *  laundering path (the family would go green on `void p['catch'](() => undefined)`). */
function literalMember(node: Node): { readonly name: string; readonly receiver: Node } | undefined {
  const member = unwrapExpression(node);
  if (member.isKind(SyntaxKind.PropertyAccessExpression)) {
    return { name: member.getName(), receiver: unwrapExpression(member.getExpression()) };
  }
  if (!member.isKind(SyntaxKind.ElementAccessExpression)) {
    return;
  }
  const key = member.getArgumentExpression();
  const name = key === undefined ? undefined : staticStringValue(key);
  return name === undefined ? undefined : { name, receiver: unwrapExpression(member.getExpression()) };
}

/** The ORDERED runtime value of a statically-knowable string expression: literal, parenthesized,
 *  literal-typed, `+`-concatenated, or a same-file `const` one hop away. Anything the reader cannot prove
 *  returns undefined — a DYNAMIC key is a declared limit, never a guess. */
function staticStringValue(node: Node): string | undefined {
  const typedLiteral = node.getType().getLiteralValue();
  if (typeof typedLiteral === "string") {
    return typedLiteral;
  }
  const value = unwrapExpression(node);
  if (value.isKind(SyntaxKind.StringLiteral) || value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return value.getLiteralValue();
  }
  if (value.isKind(SyntaxKind.BinaryExpression) && value.getOperatorToken().getText() === "+") {
    const left = staticStringValue(value.getLeft());
    const right = staticStringValue(value.getRight());
    return left === undefined || right === undefined ? undefined : left + right;
  }
  const literal = value.getType().getLiteralValue();
  if (typeof literal === "string") {
    return literal;
  }
  if (!value.isKind(SyntaxKind.Identifier)) {
    return;
  }
  const declaration = value.getSymbol()?.getDeclarations()[0];
  if (declaration?.isKind(SyntaxKind.VariableDeclaration) !== true || declaration.getVariableStatement()?.getDeclarationKind() !== "const") {
    return;
  }
  const initializer = declaration.getInitializer();
  return initializer === undefined ? undefined : staticStringValue(initializer);
}

function calleeName(call: CallExpression): string | undefined {
  const callee = unwrapExpression(call.getExpression());
  const member = literalMember(callee);
  if (member !== undefined) {
    return member.name;
  }
  return callee.isKind(SyntaxKind.Identifier) ? callee.getText() : undefined;
}

/** True for a call to OTel's `startActiveSpan` carrying `root: true` — the DETACH, which is the whole point:
 *  a parented span dispatched from inside the request it outlives never seals its bucket. */
function opensDetachedRoot(call: CallExpression): boolean {
  const callee = unwrapExpression(call.getExpression());
  const member = literalMember(callee);
  const name = member === undefined ? callee.getText() : member.name;
  if (name !== OTEL_ROOT_OPENER) {
    return false;
  }
  return call.getArguments().some((arg) => {
    const obj = unwrapExpression(arg);
    if (!obj.isKind(SyntaxKind.ObjectLiteralExpression)) {
      return false;
    }
    const prop = obj.getProperty("root");
    return prop?.isKind(SyntaxKind.PropertyAssignment) === true && prop.getInitializer()?.getText() === "true";
  });
}

/** The exported functions of the tracing module that open or own a DETACHED ROOT span. The fixpoint makes
 *  one-hop wrappers such as `superviseDetached` part of the vocabulary while preserving the `root: true`
 *  mechanical anchor. A rename keeps the family honest and a deleted detach empties the vocabulary, which
 *  is what the health tripwire reports. */
export function deriveRootSpanOpeners(sourceFiles: readonly SourceFile[]): ReadonlySet<string> {
  const out = new Set<string>();
  const exported = sourceFiles
    .filter((sf) => sf.getFilePath().includes(TRACING_MODULE))
    .flatMap((sf) => sf.getFunctions())
    .filter((fn) => fn.isExported() && fn.getName() !== undefined);
  for (const fn of exported) {
    if (fn.getDescendantsOfKind(SyntaxKind.CallExpression).some(opensDetachedRoot)) {
      out.add(fn.getNameOrThrow());
    }
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const fn of exported) {
      const name = fn.getNameOrThrow();
      if (out.has(name)) {
        continue;
      }
      const wrapsBoundary = fn.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
        const called = calleeName(call);
        return called !== undefined && out.has(called);
      });
      if (wrapsBoundary) {
        out.add(name);
        changed = true;
      }
    }
  }
  return out;
}

/** A handler that throws the rejection away and does NOTHING else — `() => undefined`, `() => {}`,
 *  `async () => {}`. A handler that logs, cleans up, or rethrows is deliberately out of scope: it is visible. */
function isDiscardingHandler(node: Node): boolean {
  const fn = unwrapExpression(node);
  if (!(fn.isKind(SyntaxKind.ArrowFunction) || fn.isKind(SyntaxKind.FunctionExpression))) {
    return false;
  }
  const body = fn.getBody();
  if (body.isKind(SyntaxKind.Block)) {
    return body.getStatements().length === 0;
  }
  return DISCARD_BODIES.has(unwrapExpression(body).getText());
}

function rejectionHandlerOf(call: CallExpression, linkName: string): Node | undefined {
  const index = REJECTION_HANDLER_ARG.get(linkName);
  return index === undefined ? undefined : call.getArguments()[index];
}

/** The `.catch(<discard>)` / `.then(_, <discard>)` link of a promise chain, or undefined when the chain never
 *  absorbs its rejection. Walks INWARD through `then`/`catch`/`finally` links only — a non-link callee ends
 *  the chain. */
function absorbingLink(expr: Node): CallExpression | undefined {
  let cur: Node = expr;
  let found: CallExpression | undefined;
  while (found === undefined && cur.isKind(SyntaxKind.CallExpression)) {
    const member = literalMember(cur.getExpression());
    if (member === undefined) {
      break;
    }
    const handler = rejectionHandlerOf(cur, member.name);
    if (handler !== undefined && isDiscardingHandler(handler)) {
      found = cur;
    } else if (PROMISE_LINKS.has(member.name)) {
      cur = member.receiver;
    } else {
      break;
    }
  }
  return found;
}

/** The WORK an absorber guards — never the plumbing link. Walks inward past `then`/`catch`/`finally` so
 *  `evicted.then(dispose).catch(h)` anchors on `evicted`, and `a.save().catch(h)` on the whole `a.save`
 *  chain. Candidate order is WIDEST identity first, matching `lib/caught-failure.ts`, so a site governed by
 *  both policies reports the same position under both. */
function workAnchorCandidates(absorber: CallExpression): readonly Node[] {
  let cursor: Node = absorber;
  for (;;) {
    if (!cursor.isKind(SyntaxKind.CallExpression)) {
      const member = literalMember(cursor);
      return member === undefined ? [cursor] : [cursor, member.receiver];
    }
    const link = literalMember(cursor.getExpression());
    if (link === undefined || !PROMISE_LINKS.has(link.name)) {
      return calleeAnchorCandidates(cursor);
    }
    cursor = link.receiver;
  }
}

const FUNCTION_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ArrowFunction,
  SyntaxKind.FunctionExpression,
  SyntaxKind.FunctionDeclaration,
  SyntaxKind.MethodDeclaration,
]);

/** Is `node` a frame that STOPS a throw from escaping `boundary`? A nested function returns/rejects
 *  elsewhere; an inner catch clause absorbs; an inner `try` block whose statement HAS a catch absorbs. */
function stopsThrow(node: Node): boolean {
  if (FUNCTION_KINDS.has(node.getKind()) || node.isKind(SyntaxKind.CatchClause)) {
    return true;
  }
  const parent = node.getParent();
  return parent?.isKind(SyntaxKind.TryStatement) === true && parent.getTryBlock() === node && parent.getCatchClause() !== undefined;
}

/** Does a syntactic `throw` escape this block? (DECLARED LIMIT: a rethrow routed through a helper call is
 *  invisible — this is a syntactic reader.) */
function rethrows(block: Block): boolean {
  return block.getDescendantsOfKind(SyntaxKind.ThrowStatement).some((thrown) => {
    let cur: Node | undefined = thrown.getParent();
    while (cur !== undefined && cur !== block) {
      if (stopsThrow(cur)) {
        return false;
      }
      cur = cur.getParent();
    }
    return true;
  });
}

/** The innermost derived-opener call this node sits inside an ARGUMENT of, or undefined. */
function enclosingOpenerCall(node: Node, openers: ReadonlySet<string>): string | undefined {
  let cur: Node | undefined = node.getParent();
  let found: string | undefined;
  while (found === undefined && cur !== undefined) {
    const name = cur.isKind(SyntaxKind.CallExpression) ? calleeName(cur) : undefined;
    if (name !== undefined && openers.has(name)) {
      found = name;
    }
    cur = cur.getParent();
  }
  return found;
}

/** Does this statement call a derived span opener ANYWHERE? Deliberately permissive: proving the opener
 *  wraps THE work needs types a syntactic reader does not have. */
function callsOpener(node: Node, openers: ReadonlySet<string>): boolean {
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const name = calleeName(call);
    return name !== undefined && openers.has(name);
  });
}

export interface DetachedWorkSite {
  readonly arm: DetachedWorkArm;
  /** The node a finding is reported ON. */
  readonly node: Node;
  /** The exact-slice waiver position, or undefined when the runtime must derive one. */
  readonly anchor: CaughtFailureAnchor | undefined;
}

/** A1 — statement-position fire-and-forget that absorbs its own rejection and opens no root. The request
 *  root has already sealed by the time this work runs, so the failure reaches no log, no trace and no
 *  caller: invisible by construction. */
export function untracedDispatchSite(statement: Node, openers: ReadonlySet<string>): DetachedWorkSite | undefined {
  if (!statement.isKind(SyntaxKind.ExpressionStatement)) {
    return;
  }
  const raw = unwrapExpression(statement.getExpression());
  const expr = raw.isKind(SyntaxKind.VoidExpression) ? unwrapExpression(raw.getExpression()) : raw;
  const absorber = absorbingLink(expr);
  // Already traced (the statement opens its own root), or already INSIDE one — the latter is the
  // blinded-rejection arm's territory, and judging it here too would double-report one absorber.
  if (absorber === undefined || callsOpener(statement, openers) || enclosingOpenerCall(statement, openers) !== undefined) {
    return;
  }
  return { arm: "untraced", node: statement, anchor: firstAnchor(statement, workAnchorCandidates(absorber)) };
}

/** A2a — a catch INSIDE an opener callback that does not rethrow, so the root seals `ok` on failure. */
export function swallowingCatchSite(clause: Node, openers: ReadonlySet<string>): DetachedWorkSite | undefined {
  if (!clause.isKind(SyntaxKind.CatchClause) || enclosingOpenerCall(clause, openers) === undefined || rethrows(clause.getBlock())) {
    return;
  }
  return { arm: "swallowed-catch", node: clause, anchor: catchAnchor(clause) };
}

/** A2b — a DISCARDING `.catch(…)` NESTED INSIDE an opener callback: it blinds the span exactly as a
 *  non-rethrowing catch does. (The same absorber attached OUTSIDE the opener call is the CORRECT shape — it
 *  is not a descendant of the call, so it is never seen here.) */
export function blindedRejectionSite(call: Node, openers: ReadonlySet<string>): DetachedWorkSite | undefined {
  if (!call.isKind(SyntaxKind.CallExpression)) {
    return;
  }
  // Judge each chain only at its OWN absorbing link, never at an enclosing one (no double-report).
  if (absorbingLink(call) !== call || enclosingOpenerCall(call, openers) === undefined) {
    return;
  }
  return { arm: "blinded-rejection", node: call, anchor: firstAnchor(call, workAnchorCandidates(call)) };
}
