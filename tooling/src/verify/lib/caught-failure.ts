// Shared reader: the CAUGHT-FAILURE OWNERSHIP classifier. A SYNTACTICALLY handled rejection is not
// ownership. Given one delivered `CatchClause` or `CallExpression`, this reader answers whether the site
// absorbs a failure with no machine-visible owner, and WHERE a waiver marker must be anchored.
//
// ── WHY THIS IS A SHARED READER AND NOT A GATE-PRIVATE ONE (#1584, census blocker at
//    docs/reviews/gate-runtime/uncovered-gate-conversion-census.md:182: "must split reusable failure facts")
// THREE consumers read the SAME producer, and that is the whole point: `gates/caught-failure-ownership.ts`
// reports from it, `ops/gen/caught-failure-population.ts` derives the durable census at
// tooling/src/verify/gates/caught-failure-ownership.population.json from it, and
// `gates/caught-failure-ownership-health.ts` joins that census back to the tree on `siteId`. Several readers
// of one population is exactly how an artifact and a gate silently disagree, so there is ONE classifier, ONE
// site identity (`keyCaughtFailureSites`) and ONE corpus (`CAUGHT_FAILURE_POPULATION`), and all of them call it.
//
// ── THE SPLIT (#1584 tooling-size) ──────────────────────────────────────────────────────────────────────
// The classifier grew past the 450-line cap and now lives in five siblings by responsibility: -core.ts (AST
// primitives — literal reads, binding identity, import/write provenance), -outcome.ts (is a value itself
// failure-shaped, and the explicit governed-sink recognizers), -scope.ts (framework provenance and the
// statement-level `hasExplicitOwner` block walk), -handler.ts (catch/promise-handler verdicts), -promise.ts
// (recognizing a rejection-handler invocation in every spelling). This file keeps only the ARMS
// (`catchClauseSite`/`promiseAbsorberSite`) and the anchor/site assembly and identity its consumers import.
//
// ── THE ARMS ────────────────────────────────────────────────────────────────────────────────────────────
//   promise   a `.catch(h)` / `.then(_, h)` — in ANY spelling: dot or bracket key (literal,
//             parenthesized, literal-typed, `+`-concatenated, same-file const), optional access, and
//             `call` / `apply` / `Reflect.apply` / a bound alias — whose handler discards the failure.
//   empty     a CatchClause whose block (and its `finally`) names no owner.
//   default   a catch whose only escape is a constant fallback (`return null` / `[]` / `{}` / `-1`).
//             The behaviour changed and nobody was told; the failure contract is unstated.
//
// ── WHAT PASSES, AND WHY IT IS ALL PROVENANCE ───────────────────────────────────────────────────────────
// Rethrow · a DISCRIMINATED rethrow (a narrowly-guarded early return beside an escaping `throw <the caught
// binding>`, or a typed wrapper chaining `{ cause: <the caught binding> }` — one documented case, every
// other failure propagates; fenced on binding IDENTITY, so a substituted value with NO cause, a lossy
// `String(err)` message, or a throw inside a nested function do NOT count) · a call that CANNOT
// RETURN (`never`, or `Promise<never>`) — control leaves only by throwing, so it is propagation, and it
// holds for a bindingless catch · `Promise.reject(err)` of the caught binding (the
// NATIVE one; a local object named `Promise` does not launder) · a structured contextual log on the
// governed pino/`getLog` logger · `securityEvent(<named event>)` at that same door (it owns without the
// caught binding by design — a reject seam must not leak the raw crypto error, so the NAMED reason is the
// trail) · the governed
// `notify`/toast manager carrying the failure with non-success copy · a genuine React `useState` SETTER
// slot (tuple element [1]) fed a failure-VALUED argument · TanStack query/form and `createEntityMutation`
// with a failure-valued `errorToast` · `withRequestSpan` · a named handler that itself owns · an
// error-as-data outcome that a real consumer reads. A success discriminator (`{ status: 'ok', error: err }`)
// REFUSES ownership: carrying the error as incidental data beside a success verdict is the laundering shape.
// Reassignment kills provenance — a governed initializer overwritten by `x = fake` owns nothing after.
//
// ── THE ANCHOR IS THE POSITION, AND THE POSITION IS AN EXACT SOURCE SLICE ────────────────────────────────
// The final ordinary-waiver engine narrows candidates TWICE: carrier containment, then
// `finding.token === marker.position` (lib/ordinary-waiver.ts:504,537), and `locateFinding` (:420,:428)
// additionally requires the finding's own line/column to point at that exact token IN AUTHORED CODE. So a
// position CANNOT be a synthetic label — the retired legacy vocabulary (`promise:save`, `empty:err`,
// `default:catch`) was exactly that, and there is no function from it to a source slice. Each site
// therefore carries its own `token`/`offset` pair, anchored inside its reported node:
//   · catch arms  → the caught BINDING's name (`err`, `error`, `e`), or the `catch` keyword when the clause
//                   is bindingless. One TryStatement holds one catch clause, but a marker's carrier holds
//                   every try statement NESTED inside it (the engine narrows by containment first, then by
//                   token), so a catch nested inside a guarded try binds a name DISTINCT from the outer
//                   one, or the outer marker is over-broad and suppresses none. The live shape is
//                   tooling/src/snap/ops/heap-capture.ts (one primary catch, three cleanup catches in its
//                   finally, four markers); the policy's `nested-cleanup` mustPass row pins it.
//   · promise arm → the WORK's callee text, never the plumbing link: `save`, `a.save`, `cache.evict`, `p`.
//                   A member chain is a legitimate token (the precedent is `no-form-state-in-useeffect`,
//                   which reports `form.state.values`), and it is what keeps two same-named absorbers in
//                   one statement separately waivable — `a.save` and `b.save` differ where the retired
//                   vocabulary had to mint a `promise:save_2` suffix that no source slice could spell.
// When no clean anchor exists (an indirect `Reflect.apply` spelling whose work node lies outside the
// reported call, or text carrying a paren/newline the marker grammar's `[^()\r\n]+` position group cannot
// hold), the site declares NO token and the runtime derives one (policy-pass-context.ts:109). That is the
// honest fallback: an underivable anchor must not become an invented label.
//
// ── DECLARED LIMITS ─────────────────────────────────────────────────────────────────────────────────────
// A dynamically-keyed rejection link is unreadable, not assumed · zod's `.catch()` combinator is schema
// construction, not a promise · a rethrow or owner routed through an opaque helper is invisible to a
// syntactic reader. The POPULATION fence (which files carry a failure contract at all) is declared once at
// the foot of this file, because two policies and the census generator must walk the same corpus.
//
// Descendant reads here are bounded SUBTREE analysis of a delivered node plus same-file binding identity —
// the shared-reader layer's own job (gate-runtime-standardization.md §3: "binding identity, static-value
// unwrapping ... are shared primitives"). No Project, no workspace cache, no filesystem, no marker parser.
import type { CallExpression, CatchClause, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureArm } from "../contract/caught-failure.ts";
import { unwrapExpression } from "./ast-read.ts";
import { FUNCTION_KINDS, hasInterveningWrite, importedName, literalMember, OBSERVABILITY_MODULES, PROMISE_CHAIN_LINKS } from "./caught-failure-core.ts";
import {
  handlerPropagatesRejection,
  handlerReturnsOwnedFailure,
  isDiscardingHandler,
  isIgnoredPromiseHandler,
  silentDefault,
  unownedCatch,
} from "./caught-failure-handler.ts";
import type { PromiseRejectionInvocation } from "./caught-failure-promise.ts";
import { isDiscardedExpression, promiseLikeValue, promiseRejectionInvocation } from "./caught-failure-promise.ts";
import { frameworkOwns, hasFrameworkOwner } from "./caught-failure-scope.ts";
import { isWaivablePosition } from "./waivable-coordinate.ts";

/** The waiver position a site declares: an exact slice of the reported node's own text, at `offset` bytes
 *  from that node's start. `undefined` means "no clean anchor exists — let the runtime derive one". */
export interface CaughtFailureAnchor {
  readonly token: string;
  readonly offset: number;
}

/** A position the marker grammar can hold, PLUS this reader's own belt. The grammar half is DERIVED from
 *  `lib/ordinary-waiver.ts` through {@link isWaivablePosition} rather than respelled here (#1957) — a second
 *  copy of `[^()\r\n]+` is a rule that can drift from the parser it is supposed to mirror. The belt is the
 *  SOLIDUS: `locateFinding` re-reads the slice out of COMMENT-BLANKED source, so a token spanning internal
 *  trivia would not match itself, and no legitimate callee or caught-binding position contains one. */
function isAnchorableToken(token: string): boolean {
  return isWaivablePosition(token) && !token.includes("/");
}

function anchorWithin(reported: Node, anchor: Node): CaughtFailureAnchor | undefined {
  const offset = anchor.getStart() - reported.getStart();
  const token = anchor.getText();
  if (offset < 0 || !isAnchorableToken(token)) {
    return;
  }
  return reported.getText().slice(offset, offset + token.length) === token ? { token, offset } : undefined;
}

/** The NAME half of a member access, in either spelling — always a single clean token, which is what makes
 *  it the usable fallback when the whole callee chain carries a newline. */
function memberNameNode(node: Node): Node | undefined {
  const member = unwrapExpression(node);
  if (member.isKind(SyntaxKind.PropertyAccessExpression)) {
    return member.getNameNode();
  }
  return member.isKind(SyntaxKind.ElementAccessExpression) ? member.getArgumentExpression() : undefined;
}

/** One call's anchors, WIDEST identity first: the whole callee chain (`a.save`), then just its member name
 *  (`save`). The chain is preferred because it is what keeps two same-named siblings in one marker carrier
 *  separately waivable; the name is what survives a MULTI-LINE chain, which the marker grammar cannot hold. */
export function calleeAnchorCandidates(call: CallExpression): readonly Node[] {
  const callee = unwrapExpression(call.getExpression());
  const name = memberNameNode(callee);
  return name === undefined ? [callee] : [callee, name];
}

/** The WORK an absorber guards — never the plumbing link. Walks inward past `then`/`catch`/`finally` so
 *  `save().then(x).catch(h)` anchors on `save`, and `a.save().catch(h)` on the whole `a.save` chain. */
function workAnchorCandidates(call: CallExpression, invocation: PromiseRejectionInvocation): readonly Node[] {
  if (!invocation.direct) {
    const receiver = invocation.receiver;
    return receiver.isKind(SyntaxKind.CallExpression) ? calleeAnchorCandidates(receiver) : [receiver];
  }
  let cursor: Node = call;
  for (;;) {
    if (!cursor.isKind(SyntaxKind.CallExpression)) {
      return [cursor];
    }
    const member = literalMember(cursor.getExpression());
    if (member === undefined || !PROMISE_CHAIN_LINKS.has(member.name)) {
      return calleeAnchorCandidates(cursor);
    }
    cursor = member.receiver;
  }
}

/** The first candidate the marker grammar can actually hold. ONE TAIL RETURN over an accumulator — biome's
 *  `noUselessUndefined` deletes a trailing `return undefined;` and tsc's `noImplicitReturns` then reds the
 *  fall-through, and this is the sanctioned shape out of that pincer (.claude/rules/tooling.md).
 *  `??=` still short-circuits, so a later candidate is never evaluated once one has anchored. */
export function firstAnchor(reported: Node, candidates: readonly Node[]): CaughtFailureAnchor | undefined {
  let found: CaughtFailureAnchor | undefined;
  for (const candidate of candidates) {
    found ??= anchorWithin(reported, candidate);
  }
  return found;
}

/** One PROMISE-shaped site: the absorber call, or undefined when the rejection is propagated, ignored,
 *  consumed as error-as-data, or owned by a governed framework surface. */
export function promiseAbsorberSite(call: CallExpression): CaughtFailureSite | undefined {
  const invocation = promiseRejectionInvocation(call);
  if (invocation === undefined) {
    return;
  }
  const { handler, receiver } = invocation;
  if (
    isIgnoredPromiseHandler(handler) ||
    !promiseLikeValue(receiver) ||
    handlerPropagatesRejection(handler) ||
    !isDiscardingHandler(handler) ||
    (!isDiscardedExpression(call) && handlerReturnsOwnedFailure(handler) && recoveredFailureIsConsumed(call))
  ) {
    return;
  }
  const workCall = underlyingWorkCall(call, invocation);
  if (workCall !== undefined && frameworkOwns(workCall)) {
    return;
  }
  // The WORK is the position a reader would name, widest identity first. The later candidates are the
  // fallbacks that keep the position DERIVABLE rather than invented: a MULTI-LINE chain cannot hold its
  // whole callee in a position group, so the member NAME carries it; an indirect `Reflect.apply` /
  // bound-alias spelling has its work node OUTSIDE the reported call, so the ABSORBER's own callee — always
  // a prefix of the reported node — carries it, and its link name is the last resort. Only a wholly
  // parenthesized or computed callee leaves the anchor underivable, and the census REFUSES loudly on one.
  return {
    arm: "promise",
    node: call,
    anchor: firstAnchor(call, [...workAnchorCandidates(call, invocation), ...calleeAnchorCandidates(call)]),
  };
}

/** The call that produced the promise, walking inward past `then`/`catch`/`finally` — the node a framework
 *  owner (a TanStack query/mutation/form) has to be proven ON. */
function underlyingWorkCall(call: CallExpression, invocation: PromiseRejectionInvocation): CallExpression | undefined {
  if (!invocation.direct) {
    return invocation.receiver.isKind(SyntaxKind.CallExpression) ? invocation.receiver : undefined;
  }
  let workCall: CallExpression = call;
  let cursor: Node = call;
  let walking = true;
  while (walking && cursor.isKind(SyntaxKind.CallExpression)) {
    const cursorMember = literalMember(cursor.getExpression());
    if (cursorMember === undefined || !PROMISE_CHAIN_LINKS.has(cursorMember.name)) {
      workCall = cursor;
      walking = false;
    } else {
      cursor = cursorMember.receiver;
    }
  }
  return workCall;
}

function recoveredFailureIsConsumed(call: CallExpression): boolean {
  const declaration = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
  const initializer = declaration?.getInitializer();
  // The absorber must be INSIDE this declaration's initializer to be the value the binding holds; otherwise
  // the enclosing declaration is incidental and the chain is judged where it actually sits.
  const heldByBinding = initializer !== undefined && initializer.getStart() <= call.getStart() && initializer.getEnd() >= call.getEnd();
  if (declaration === undefined || !heldByBinding) {
    return valueHasMeaningfulConsumer(call);
  }
  return declaration
    .getNameNode()
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .concat(declaration.getNameNode().isKind(SyntaxKind.Identifier) ? [declaration.getNameNode().asKindOrThrow(SyntaxKind.Identifier)] : [])
    .some((identifier) =>
      identifier.findReferencesAsNodes().some((reference) => {
        if (reference.getStart() <= declaration.getEnd() || hasInterveningWrite(reference, declaration)) {
          return false;
        }
        const declarationBoundary = declaration.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()));
        const referenceBoundary = reference.getFirstAncestor((ancestor) => FUNCTION_KINDS.has(ancestor.getKind()));
        return declarationBoundary === referenceBoundary && valueHasMeaningfulConsumer(reference);
      }),
    );
}

/** Kinds that pass a value along without consuming it, on the CONSUMPTION walk. */
const CONSUMER_PASSTHROUGH_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.AsExpression,
  SyntaxKind.AwaitExpression,
  SyntaxKind.NonNullExpression,
  SyntaxKind.ParenthesizedExpression,
]);

function encloses(argument: Node, current: Node): boolean {
  return argument === current || (argument.getStart() <= current.getStart() && argument.getEnd() >= current.getEnd());
}

/** Does an error-as-data recovery value reach a REAL consumer? Only two shapes count: it is RETURNED to a
 *  caller, or it is handed to the governed observability sink. Being passed to a local no-op, voided, or
 *  dropped in statement position is not consumption — the recovered failure dies there. */
function valueHasMeaningfulConsumer(node: Node): boolean {
  let current = node;
  for (;;) {
    const here = current;
    const parent = here.getParent();
    if (parent === undefined || parent.isKind(SyntaxKind.VoidExpression) || parent.isKind(SyntaxKind.ExpressionStatement)) {
      return false;
    }
    if (parent.isKind(SyntaxKind.ReturnStatement)) {
      return true;
    }
    if (parent.isKind(SyntaxKind.CallExpression) && parent.getArguments().some((argument) => encloses(argument, here))) {
      return importedName(parent.getExpression(), OBSERVABILITY_MODULES) === "recordTurnOutcome";
    }
    const implicitReturn = parent.isKind(SyntaxKind.ArrowFunction) && parent.getBody() === here;
    if (!(implicitReturn || CONSUMER_PASSTHROUGH_KINDS.has(parent.getKind()))) {
      return false;
    }
    current = parent;
  }
}

export interface CaughtFailureSite {
  readonly arm: CaughtFailureArm;
  /** The node a finding is reported ON — the catch clause, or the whole absorber call. */
  readonly node: Node;
  /** The exact-slice waiver position, or undefined when the runtime must derive one. */
  readonly anchor: CaughtFailureAnchor | undefined;
}

/** The catch arm's anchor: the caught BINDING's name, or the `catch` keyword when the clause is bindingless
 *  (always offset 0 of the clause, so it can never fail to anchor). */
export function catchAnchor(clause: CatchClause): CaughtFailureAnchor | undefined {
  const binding = clause.getVariableDeclaration()?.getNameNode();
  return (binding === undefined ? undefined : anchorWithin(clause, binding)) ?? { token: "catch", offset: 0 };
}

/** One CATCH-shaped site. `default` wins over `empty`: a catch that returns a fallback is a behaviour CHANGE
 *  nobody was told about, which is the sharper finding. A try block whose single statement is a governed
 *  TanStack/tracing owner is not a site at all — the same way a framework-owned promise absorber is not one. */
export function catchClauseSite(clause: CatchClause): CaughtFailureSite | undefined {
  if (silentDefault(clause)) {
    return { arm: "default", node: clause, anchor: catchAnchor(clause) };
  }
  if (!unownedCatch(clause)) {
    return;
  }
  const tryBlock = clause.getParentIfKind(SyntaxKind.TryStatement)?.getTryBlock();
  if (tryBlock !== undefined && hasFrameworkOwner(tryBlock)) {
    return;
  }
  return { arm: "empty", node: clause, anchor: catchAnchor(clause) };
}

/** Every caught-failure site in ONE file, in source order — the file-level door the durable census
 *  (`ops/gen/caught-failure-population.ts`) walks. The POLICY does not call this: its dispatcher delivers
 *  `CatchClause` and `CallExpression` nodes to `catchClauseSite`/`promiseAbsorberSite` directly, so the two
 *  consumers share the per-site verdict without sharing a walk. */
export function caughtFailureReviewSites(sf: SourceFile): readonly CaughtFailureSite[] {
  const sites: CaughtFailureSite[] = [];
  for (const clause of sf.getDescendantsOfKind(SyntaxKind.CatchClause)) {
    const site = catchClauseSite(clause);
    if (site !== undefined) {
      sites.push(site);
    }
  }
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const site = promiseAbsorberSite(call);
    if (site !== undefined) {
      sites.push(site);
    }
  }
  return sites.toSorted((left, right) => left.node.getStart() - right.node.getStart());
}

/** The ONE spelling of a site's move-stable identity: path, the exact reported position, and the 1-based
 *  occurrence of that (path, position) pair in file order. No coordinate enters it, so a line inserted above
 *  a site leaves its id — and the committed census row keyed on it — untouched. */
function caughtFailureSiteId(path: string, position: string, ordinal: number): string {
  return `${path}::${position}::${ordinal}`;
}

/** One site with its identity, or with `siteId: undefined` when the classifier derived no anchor — such a
 *  site has no position to key on, and each consumer refuses it in its own terms rather than inventing one. */
interface KeyedCaughtFailureSite {
  readonly site: CaughtFailureSite;
  readonly siteId: string | undefined;
  readonly ordinal: number;
}

/** Key ONE file's sites. Sorted by source position here rather than trusted from the caller, because the
 *  ordinal is an occurrence count in FILE ORDER and the two consumers collect their sites differently: the
 *  census walks the file, the health policy receives dispatcher-delivered nodes. */
export function keyCaughtFailureSites(path: string, sites: readonly CaughtFailureSite[]): readonly KeyedCaughtFailureSite[] {
  const ordinals = new Map<string, number>();
  return sites
    .toSorted((left, right) => left.node.getStart() - right.node.getStart())
    .map((site) => {
      if (site.anchor === undefined) {
        return { site, siteId: undefined, ordinal: 0 };
      }
      const ordinal = (ordinals.get(site.anchor.token) ?? 0) + 1;
      ordinals.set(site.anchor.token, ordinal);
      return { site, siteId: caughtFailureSiteId(path, site.anchor.token, ordinal), ordinal };
    });
}

/** The corpus that carries a failure contract: every shipped product package plus `tooling/src`. Homed here,
 *  not in either policy, because the ordinary occurrence policy, its hard census-join sibling and the census
 *  generator must walk the SAME files — a census over a different corpus reads every missing file's sites as
 *  `gone`. The port history of this expression is in the `caught-failure-ownership` policy header. */
export const CAUGHT_FAILURE_POPULATION = ["@product", "@tooling"] as const;
