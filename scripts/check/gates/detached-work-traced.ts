// Gate: detached-work-traced — fire-and-forget work whose FAILURE IS INVISIBLE. Two arms of ONE class that
// recurred SIX times in this tree: statement-position work that absorbs its own error must open its own
// DETACHED ROOT span (A1), and a catch inside such a span must not swallow, or the span seals `status:"ok"`
// on every failure (A2). The SPAN VOCABULARY IS DERIVED from the tracing module (zero hardcoded symbol
// names) with a blindness tripwire. Escape: the two-sided `@swallowed-ok(<position>): <reason>` marker.
//
// ── THE ARMS ────────────────────────────────────────────────────────────────────────────────────────────
//   A1 untraced    — an ExpressionStatement (`void x.y().catch(() => undefined)`, or the same without `void`)
//                    whose chain ends in a DISCARDING rejection handler — an empty/constant-returning arrow,
//                    i.e. the error is thrown away and nothing at all happens — and whose statement calls NO
//                    derived span opener. The request root has already sealed by the time this work runs, so
//                    the failure reaches no log, no trace, and no caller: invisible by construction.
//   A2 swallow     — INSIDE a derived span opener's callback: a CatchClause whose block does not RETHROW, or
//                    a DISCARDING rejection handler. `withRequestSpan` seals OK unless the callback rejects,
//                    so a warn+emit+return catch paints the trace dashboard green while the work fails — the
//                    exact "looked done and silently wasn't" disease. Found riding on A1 in the memory +
//                    compaction builds. The absorbing `.catch(() => undefined)` on the OUTSIDE of the opener
//                    call is the CORRECT shape and passes: it protects the caller without blinding the span.
//   A3 marker      — `// @swallowed-ok(<position>): <reason>` on the guarded line or the comment block above
//                    it exempts that ONE named thing. The position is the A1 dispatch callee (`onUserCommit`,
//                    `cancel`) or the A2 catch binding (`catch` when bindingless). The reason is REQUIRED
//                    (house grammar `marker:\s*\S`); the NAME is required because one line can carry two
//                    guarded things (`void a().catch(() => undefined); void b().catch(() => undefined);`).
//                    TWO-SIDED: a marker naming no live guarded position is RED (a stale exemption is a
//                    loaded gun — the next swallow written there inherits it), and a MALFORMED marker (no
//                    name and/or no reason, so it exempts nothing) reds as its own flavour rather than
//                    sitting there looking like protection.
//   A4 blindness   — ZERO span openers derived from the tracing module ⇒ RED. A gate keyed on a derivation
//                    that stops resolving reports ✓ forever (GATE-AUTHORING §4.6).
//
// ── WHY THE DERIVATION, NOT THE NAME ────────────────────────────────────────────────────────────────────
// An "opener" is an EXPORTED function of `foundation/observability/tracing.ts` that calls OTel's
// `startActiveSpan` with `root: true`. `root: true` is the load-bearing bit (the ring seals a bucket only
// when a PARENTLESS span lands — a parented span dispatched from inside the request it outlives is dropped
// as a late orphan), so the gate keys on the MECHANISM. Renaming `withRequestSpan` keeps the gate honest;
// deleting the detach makes the derivation empty and A4 REDS.
//
// ── DECLARED LIMITS (each with a mustPass row) ──────────────────────────────────────────────────────────
// A1 reads only DISCARDING handlers: a handler that logs, cleans up, or rethrows is out of scope (it is
// visible), and so is a bare `void work()` with no handler at all (an unhandled rejection is loud). Only
// STATEMENT position counts — an absorber nested inside an argument is not the class. "Traced" is satisfied
// by ANY opener call anywhere in the statement (deliberately permissive: proving the opener wraps THE work
// needs types this syntactic reader does not have). A2 reads only a syntactic `throw` that escapes the catch
// block — a rethrow through a helper call is invisible to it. And the gate cannot prove a span is MEANINGFUL:
// that its name, id, or attributes correlate to the work it wraps. It proves a root is opened and that errors
// reach it; a wrong-but-present span passes.
import type { Block, CallExpression, Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { unwrapExpression } from "../ast-read.ts";
import type { Finding, GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

const TRACING_MODULE = "packages/server/src/foundation/observability/tracing.ts";
/** The real-tree ANCHOR for the whole-tree arm. Deliberately NOT the tracing module: every conformance
 *  mini-project PLANTS that file (it is the derivation source), so anchoring there would fire A4 inside the
 *  gate's own self-proof (GATE-AUTHORING §4.5). */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const GATE_SELF = "scripts/check/gates/detached-work-traced.ts";
const OTEL_ROOT_OPENER = "startActiveSpan";

/** The escape marker, in the house grammar every sibling marker uses (`allow-skip:`, `FABRICATION-OK:`,
 *  `@foreign-id-ok(…):`, `@typeonly-ok:`, `@server-only:`). Distinct from `ast.ts`'s bare `@swallowed-ok:`
 *  export marker by the required (position) — that lens reads only leading comments of EXPORTED declarations
 *  and this one only guards statements/catches, so the two vocabularies cannot collide. */
const SWALLOWED_OK_RE = /@swallowed-ok\(([A-Za-z0-9_]+)\):\s*\S/u;
/** The BARE form — used ONLY by the stale arm, so a malformed marker (no position, no reason, or both) reds
 *  as its own flavour instead of being invisible to both sides. */
const SWALLOWED_OK_BARE_RE = /@swallowed-ok/u;

const PROMISE_LINKS: ReadonlySet<string> = new Set(["then", "catch", "finally"]);
/** Which ARGUMENT of a promise link is its rejection handler — `.catch(onRejected)` / `.then(_, onRejected)`.
 *  A Record, not a chain of ternaries: a new link spelling is one row. */
const REJECTION_HANDLER_ARG: ReadonlyMap<string, number> = new Map([
  ["catch", 0],
  ["then", 1],
]);
/** Bodies that throw the rejection away and do nothing else. `() => {}` is the empty-Block form. */
const DISCARD_BODIES: ReadonlySet<string> = new Set(["undefined", "null", "void 0"]);
const FALLBACK_POSITION = "detached";
/** The A2 position name for a bindingless `catch {`. Two bindingless catches guarded on ONE line would share
 *  it — give one a binding to disambiguate (the declared limit, with its mustPass row). */
const UNBOUND_CATCH_POSITION = "catch";

const MESSAGE =
  "fire-and-forget work whose FAILURE IS INVISIBLE. Detached work outlives the request that dispatched it: " +
  "by the time it runs, the request root span has sealed, so a PARENTED span is dropped as a late orphan and " +
  "an absorbed rejection reaches no log, no trace, and no caller. And a catch inside a detached root that " +
  'does not rethrow seals that root `status:"ok"` on EVERY failure — the trace dashboard shows green while ' +
  "the work fails. This class recurred six times after it had already been fixed once " +
  "(packages/server/src/foundation/observability/tracing.ts).";

const FIX =
  "wrap the dispatch in its own DETACHED root — `void withRequestSpan(<ownRequestId>, <spanName>, <attrs>, " +
  "() => work()).catch(() => undefined)` — keyed by its OWN id (never the HTTP request's; see " +
  "`rpgRoundRequestId` in domain/chat/engine/engine.ts for the shape). Inside that callback, a catch that " +
  "warns/emits must RETHROW afterwards so the span marks ERROR; the outer `.catch(() => undefined)` OUTSIDE " +
  "the span is what keeps the caller unbroken. If the work genuinely has nothing to trace and no caller to " +
  "inform (a stream teardown, a cache eviction), add " +
  "`// @swallowed-ok(<position>): <why it is invisible on purpose + what would end the exemption>` on the " +
  "line or the line above — the marker NAMES the position, so it cannot launder a second dispatch beside it.";

const BLIND =
  `detached-work-traced derived ZERO root-span openers from ${TRACING_MODULE} — no exported function there ` +
  `calls \`${OTEL_ROOT_OPENER}\` with \`root: true\`, so the gate is scanning for a vocabulary that no longer ` +
  "exists and has gone silently green. Re-point the derivation in scripts/check/gates/detached-work-traced.ts " +
  "(the name-keyed blindness tripwire, GATE-AUTHORING.md §4.6).";

const A1_MESSAGE = (position: string, openers: readonly string[]): string =>
  `\`${position}\` is dispatched fire-and-forget with a DISCARDING rejection handler and no detached root span ` +
  `— its failure is invisible everywhere. Open one with ${openers.map((o) => `\`${o}\``).join(" / ")}.`;

const A2_MESSAGE = (position: string, opener: string, what: string): string =>
  `the ${what} on \`${position}\` is inside a \`${opener}\` callback and does not RETHROW — the span therefore ` +
  'seals `status:"ok"` on every failure, so the trace surface reports success for work that failed ' +
  "(packages/server/src/foundation/observability/tracing.ts).";

const STALE_MARKER = (named: string): string =>
  `\`@swallowed-ok(${named})\` guards nothing — \`${named}\` is not a detached-work dispatch or a swallowing ` +
  "catch on the line this marker guards (the first code line below its comment block). It was traced, " +
  "renamed, or deleted; delete the marker (a stale exemption is a lie, and the next swallow written here " +
  "would silently inherit it). (GATE-AUTHORING.md §4.4)";

const MALFORMED_MARKER =
  "`@swallowed-ok` marker is MALFORMED, so it exempts nothing at all — the grammar is " +
  "`// @swallowed-ok(<position>): <why it is invisible on purpose + what would end the exemption>`, and both " +
  "the named position and the reason are REQUIRED (the name is what keeps a marker from laundering a second " +
  "dispatch declared on the same line). Fix it, or delete it. (GATE-AUTHORING.md §4.3)";

// ── derivation ──────────────────────────────────────────────────────────────────────────────────────────

/** True for a call to OTel's `startActiveSpan` carrying `root: true` — the DETACH, which is the whole point:
 *  a parented span dispatched from inside the request it outlives never seals its bucket. */
function opensDetachedRoot(call: CallExpression): boolean {
  const callee = unwrapExpression(call.getExpression());
  const name = callee.isKind(SyntaxKind.PropertyAccessExpression) ? callee.getName() : callee.getText();
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

/** The exported functions of the tracing module that open a DETACHED ROOT span. Derived, so a rename keeps
 *  the gate honest and a deleted detach makes A4 red instead of the gate going quietly green. */
export function deriveRootSpanOpeners(sourceFiles: readonly SourceFile[]): Set<string> {
  const out = new Set<string>();
  for (const sf of sourceFiles) {
    if (!sf.getFilePath().includes(TRACING_MODULE)) {
      continue;
    }
    for (const fn of sf.getFunctions()) {
      const name = fn.getName();
      if (name === undefined || !fn.isExported()) {
        continue;
      }
      if (fn.getDescendantsOfKind(SyntaxKind.CallExpression).some(opensDetachedRoot)) {
        out.add(name);
      }
    }
  }
  return out;
}

// ── shared readers ──────────────────────────────────────────────────────────────────────────────────────

function calleeName(call: CallExpression): string | undefined {
  const callee = unwrapExpression(call.getExpression());
  if (callee.isKind(SyntaxKind.PropertyAccessExpression)) {
    return callee.getName();
  }
  return callee.isKind(SyntaxKind.Identifier) ? callee.getText() : undefined;
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

/** The `.catch(<discard>)` / `.then(_, <discard>)` link of a promise chain, or undefined when the chain never
 *  absorbs its rejection. Walks INWARD through `then`/`catch`/`finally` links only — a non-link callee ends
 *  the chain. */
function rejectionHandlerOf(call: CallExpression, linkName: string): Node | undefined {
  const index = REJECTION_HANDLER_ARG.get(linkName);
  return index === undefined ? undefined : call.getArguments()[index];
}

function absorbingLink(expr: Node): CallExpression | undefined {
  let cur: Node = expr;
  let found: CallExpression | undefined;
  while (found === undefined && cur.isKind(SyntaxKind.CallExpression)) {
    const callee = unwrapExpression(cur.getExpression());
    if (!callee.isKind(SyntaxKind.PropertyAccessExpression)) {
      break;
    }
    const name = callee.getName();
    const handler = rejectionHandlerOf(cur, name);
    if (handler !== undefined && isDiscardingHandler(handler)) {
      found = cur;
    } else if (PROMISE_LINKS.has(name)) {
      cur = unwrapExpression(callee.getExpression());
    } else {
      break;
    }
  }
  return found;
}

/** The name the marker would use for an A1 dispatch: the callee of the work itself, found by walking inward
 *  past the promise plumbing (`evicted.then(dispose).catch(…)` → `evicted`, not `then`). */
function dispatchPosition(absorber: CallExpression): string {
  let cur: Node = absorber;
  for (;;) {
    if (cur.isKind(SyntaxKind.CallExpression)) {
      const callee = unwrapExpression(cur.getExpression());
      if (callee.isKind(SyntaxKind.PropertyAccessExpression) && PROMISE_LINKS.has(callee.getName())) {
        cur = unwrapExpression(callee.getExpression());
        continue;
      }
      return calleeName(cur) ?? FALLBACK_POSITION;
    }
    if (cur.isKind(SyntaxKind.Identifier)) {
      return cur.getText();
    }
    if (cur.isKind(SyntaxKind.PropertyAccessExpression)) {
      return cur.getName();
    }
    return FALLBACK_POSITION;
  }
}

/** Does this statement call a derived span opener ANYWHERE? Deliberately permissive (see DECLARED LIMITS):
 *  proving the opener wraps THE work needs types a syntactic reader does not have. */
function callsOpener(node: Node, openers: ReadonlySet<string>): boolean {
  return node.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const name = calleeName(call);
    return name !== undefined && openers.has(name);
  });
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

// ── markers ─────────────────────────────────────────────────────────────────────────────────────────────

const COMMENT_LINE_RE = /^\s*(?:\/\/|\*|\/\*)/u;
const BLANK_LINE_RE = /^\s*$/u;

interface MarkerRef {
  readonly line: number;
  readonly name: string | undefined;
  readonly guards: number;
}

/**
 * Every marker in a file, resolved to the 1-based line it GUARDS. A marker guards the first line BELOW it
 * that is neither comment nor blank — the statement its comment block sits on top of — unless it rides at the
 * end of a code line, in which case it guards its own. BLOCK-SCOPED by construction (GATE-AUTHORING §4.3b):
 * markers accumulate for the next guarded node and then stop applying, so a marker can never silently exempt
 * the rest of the file. ONE resolver, read by the detector AND the stale arm, so the two cannot disagree.
 */
function resolveMarkers(lines: readonly string[]): MarkerRef[] {
  const out: MarkerRef[] = [];
  for (const [index, text] of lines.entries()) {
    if (!SWALLOWED_OK_BARE_RE.test(text)) {
      continue;
    }
    const lineNo = index + 1;
    let guards = lineNo;
    if (BLANK_LINE_RE.test(text.slice(0, text.indexOf("//")))) {
      guards = lineNo + 1;
      while (guards <= lines.length && (COMMENT_LINE_RE.test(lines[guards - 1] ?? "") || BLANK_LINE_RE.test(lines[guards - 1] ?? ""))) {
        guards += 1;
      }
    }
    out.push({ line: lineNo, name: SWALLOWED_OK_RE.exec(text)?.[1], guards });
  }
  return out;
}

// ── detection ───────────────────────────────────────────────────────────────────────────────────────────

/** 1-based column of a node's first token on its own line. */
function columnOf(node: Node): number {
  return node.getStart() - node.getStartLinePos() + 1;
}

interface GuardedSite {
  readonly line: number;
  readonly column: number;
  readonly position: string;
  readonly message: string;
}

/** A1 — statement-position fire-and-forget that absorbs its own rejection and opens no root. */
function untracedDispatchSites(sf: SourceFile, openers: ReadonlySet<string>): GuardedSite[] {
  const openerList = [...openers].sort();
  const out: GuardedSite[] = [];
  for (const stmt of sf.getDescendantsOfKind(SyntaxKind.ExpressionStatement)) {
    const raw = unwrapExpression(stmt.getExpression());
    const expr = raw.isKind(SyntaxKind.VoidExpression) ? unwrapExpression(raw.getExpression()) : raw;
    const absorber = absorbingLink(expr);
    // Already traced (the statement opens its own root), or already INSIDE one — the latter is A2's
    // territory, and judging it here too would double-report the same absorber.
    if (absorber === undefined || callsOpener(stmt, openers) || enclosingOpenerCall(stmt, openers) !== undefined) {
      continue;
    }
    const position = dispatchPosition(absorber);
    out.push({ line: stmt.getStartLineNumber(), column: columnOf(stmt), position, message: A1_MESSAGE(position, openerList) });
  }
  return out;
}

/** A2a — a catch INSIDE an opener callback that does not rethrow, so the root seals `ok` on failure. */
function swallowingCatchSites(sf: SourceFile, openers: ReadonlySet<string>): GuardedSite[] {
  const out: GuardedSite[] = [];
  for (const clause of sf.getDescendantsOfKind(SyntaxKind.CatchClause)) {
    const opener = enclosingOpenerCall(clause, openers);
    if (opener === undefined || rethrows(clause.getBlock())) {
      continue;
    }
    const position = clause.getVariableDeclaration()?.getName() ?? UNBOUND_CATCH_POSITION;
    out.push({ line: clause.getStartLineNumber(), column: columnOf(clause), position, message: A2_MESSAGE(position, opener, "catch") });
  }
  return out;
}

/** A2b — a DISCARDING `.catch(…)` NESTED INSIDE an opener callback: it blinds the span exactly as a
 *  non-rethrowing catch does. (The same absorber attached OUTSIDE the opener call is the CORRECT shape — it
 *  is not a descendant of the call, so it is never seen here.) */
function blindedRejectionSites(sf: SourceFile, openers: ReadonlySet<string>): GuardedSite[] {
  const out: GuardedSite[] = [];
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    // Judge each chain only at its OWN absorbing link, never at an enclosing one (no double-report).
    const opener = absorbingLink(call) === call ? enclosingOpenerCall(call, openers) : undefined;
    if (opener === undefined) {
      continue;
    }
    const position = dispatchPosition(call);
    out.push({ line: call.getStartLineNumber(), column: columnOf(call), position, message: A2_MESSAGE(position, opener, "discarded rejection") });
  }
  return out;
}

/** A1 + A2 — every guarded site in one file, BEFORE the marker filter. One producer, so the detector and the
 *  stale arm can never disagree about what a markable position is. */
function guardedSites(sf: SourceFile, openers: ReadonlySet<string>): GuardedSite[] {
  return [...untracedDispatchSites(sf, openers), ...swallowingCatchSites(sf, openers), ...blindedRejectionSites(sf, openers)];
}

/** Every finding in one file: the unmarked guarded sites (A1/A2) plus the stale/malformed markers (A3). */
export function detachedWorkFindings(sf: SourceFile, rel: string, openers: ReadonlySet<string>): Finding[] {
  const sites = guardedSites(sf, openers);
  const markers = resolveMarkers(sf.getFullText().split("\n"));
  const out: Finding[] = [];
  for (const site of sites) {
    const exempt = markers.some((marker) => marker.guards === site.line && marker.name === site.position);
    if (!exempt) {
      out.push({ file: rel, line: site.line, column: site.column, message: site.message });
    }
  }
  for (const marker of markers) {
    const live = marker.name !== undefined && sites.some((site) => site.line === marker.guards && site.position === marker.name);
    if (!live) {
      out.push({ file: rel, line: marker.line, column: 1, message: marker.name === undefined ? MALFORMED_MARKER : STALE_MARKER(marker.name) });
    }
  }
  return out.sort((a, b) => a.line - b.line || a.column - b.column);
}

/** Repo-relative form of an absolute source path. */
function repoRel(path: string): string {
  const idx = path.indexOf("/packages/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/** The scanned corpus. Server source only: the request-span ring is a server concern, and `tests/` fires and
 *  forgets constantly with no ring to be invisible on. Defensive `includes` form — the wrong path format is a
 *  SILENT GREEN (GATE-AUTHORING §3). */
export function inScope(path: string): boolean {
  return path.includes("packages/server/src/");
}

let passOpeners: ReadonlySet<string> = new Set<string>();

export const gate: GateDescriptor = {
  name: "detached-work-traced",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3) — core/Tier-2-Foundation.md (observability: the per-requestId trace ring)",
  status: "active",
  // The opener vocabulary is derived from ANOTHER file, and A4 is a tree-wide claim.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  scanRoot: inScope,
  begin: (ctx: GateRunCtx) => {
    passOpeners = deriveRootSpanOpeners(ctx.project.getSourceFiles());
  },
  visitFile: (sf, ctx) => {
    if (passOpeners.size === 0) {
      return; // A4 speaks for the whole run; per-file findings from an empty vocabulary would be noise.
    }
    for (const finding of detachedWorkFindings(sf, repoRel(sf.getFilePath()), passOpeners)) {
      ctx.report(finding);
    }
  },
  finalize: (ctx) => {
    // A WHOLE-TREE claim: a conformance mini-project plants its own tracing module, so the anchor is the
    // schema barrel — present on every real run, on no example's path (§4.5).
    if (ctx.scope.kind !== "project" || !fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    if (passOpeners.size === 0) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND });
    }
  },

  mustFlag: [
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/verbs/turn.ts": "export function fire(ctx: C): void {\n  void ctx.rpg.onUserCommit(a, b).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, messageIncludes: "`onUserCommit` is dispatched fire-and-forget" },
      why: "A1, the founding shape — the live `fireRpgUserCommit` this gate found on landing: a background snapshot-commit whose rejection is discarded, outside any span",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/engine/engine.ts":
          "export function fire(deps: D): void {\n" +
          "  void withRequestSpan(id, NAME, {}, async () => {\n" +
          "    try {\n      await deps.build();\n    } catch (err) {\n      log.warn({ err }, 'failed');\n    }\n  }).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, messageIncludes: "does not RETHROW" },
      why: "A2, the defect riding on A1 — the memory/compaction catch that warned and returned, sealing the span `ok` on every failure. The dashboard showed green while the build failed",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/entry/compose/search-discovery.ts":
          "export function enqueue(w: W): void {\n" +
          "  void withRequestSpan(id, NAME, {}, async () => {\n    await w.start(a).catch(() => undefined);\n  }).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, messageIncludes: "the discarded rejection on `start`" },
      why: "A2's second shape — moving the discard INSIDE the callback would be the obvious way to 'fix' A1 while keeping the span permanently green. The span can only mark ERROR if the rejection reaches it",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/egress.ts":
          "export function tear(res: R): void {\n  // @swallowed-ok\n  void res.body.cancel().catch(() => undefined);\n}\n",
      },
      // TWO findings: the unexempted dispatch AND the malformed marker that failed to exempt it.
      expect: { count: 2, messageIncludes: "MALFORMED" },
      why: "a marker with neither a named position nor a reason exempts nothing — the dispatch still REDs and the marker reds beside it, instead of sitting there looking like protection",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/egress.ts":
          "export function tear(res: R): void {\n  // @swallowed-ok(cancel): stream teardown. Ends if it ever does traceable work.\n  void withRequestSpan(id, NAME, {}, () => res.body.cancel()).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, messageIncludes: "guards nothing" },
      why: "A3 STALE: the dispatch was wrapped in a span and the marker stayed — a loaded gun the next untraced swallow on that line would inherit",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/egress.ts":
          "export function tear(a: R, b: R): void {\n" +
          "  // @swallowed-ok(cancel): stream teardown. Ends if it ever does traceable work.\n" +
          "  void a.cancel().catch(() => undefined); void b.destroy().catch(() => undefined);\n}\n",
      },
      expect: { count: 1, messageIncludes: "`destroy` is dispatched" },
      why: "THE reason the marker names its position — two dispatches on ONE line: the named `cancel` is exempt, `destroy` beside it is still RED. A line-scoped marker would have laundered both",
    },
    {
      files: {
        [TRACING_MODULE]: "export function withRequestSpan(id: string, fn: () => Promise<void>): Promise<void> {\n  return t.startActiveSpan(id, {}, fn);\n}\n",
        [REAL_TREE_ANCHOR]: "export const tables = {};\n",
        "packages/server/src/domain/chat/verbs/turn.ts": "export function fire(ctx: C): void {\n  void ctx.rpg.onUserCommit(a, b).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, messageIncludes: "derived ZERO root-span openers" },
      why: "A4 blindness — the tracing module dropped `root: true`, so the vocabulary is empty. Without this the gate reports ✓ forever on a tree it can no longer read (GATE-AUTHORING §4.6)",
    },
  ],
  mustPass: [
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/engine/engine.ts":
          "export function fire(ctx: C): void {\n" +
          "  void withRequestSpan(reqId(t), SPAN, { chatId }, () => ctx.rpg.onTurnAborted(c, t, r)).catch(() => undefined);\n}\n",
      },
      why: "the SHAPE the fix asks for (OBSCLOSE's landed code): the detached root is opened INSIDE, and the absorbing `.catch` sits OUTSIDE it so the caller is never broken while the span still records the error",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/engine/engine.ts":
          "export function fire(deps: D): void {\n" +
          "  void withRequestSpan(id, NAME, {}, async () => {\n" +
          "    try {\n      await deps.build();\n    } catch (err) {\n      log.warn({ err }, 'failed');\n      throw err;\n    }\n  }).catch(() => undefined);\n}\n",
      },
      why: "the A2 fix: warn (or emit) and then RETHROW — the span marks ERROR, the outer absorb keeps it fire-and-forget. This is exactly the pair OBSCLOSE landed",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/egress.ts":
          "export function tear(res: R): void {\n" +
          "  // @swallowed-ok(cancel): a teardown of an already-failed egress stream — no work to trace, no caller to inform. Ends if it ever does traceable work.\n" +
          "  void res.body.cancel().catch(() => undefined);\n}\n",
      },
      why: "the deliberate-invisibility escape with its reason and end condition — the live egress-teardown class. The reason is the deliverable, not the silence",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/egress.ts":
          "export function tear(a: R, b: R): void {\n" +
          "  // @swallowed-ok(destroy): the second one. Ends when it is traced.\n" +
          "  // @swallowed-ok(cancel): the first one. Ends when it is traced.\n" +
          "  void a.cancel().catch(() => undefined); void b.destroy().catch(() => undefined);\n}\n",
      },
      why: "STACKED markers on one guarded line — the resolver walks the whole comment BLOCK, so the OUTER marker is not silently dropped (the regression brand-in-name-position's real-tree probe caught, written down here as a baseline)",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/entry/lifecycle.ts":
          "export function boot(s: S): void {\n  void s.drain().catch((err: unknown) => log.error({ err }, 'drain failed'));\n}\n",
      },
      why: "DECLARED LIMIT: only a DISCARDING handler counts. A handler that logs is already visible — the defect is invisibility, not fire-and-forget itself",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/transport/jobs/worker.ts": "export function boot(deps: D): void {\n  void reapOnce(deps);\n}\n",
      },
      why: "DECLARED LIMIT: a bare `void work()` with NO handler is out of scope — an unhandled rejection is loud (it reaches the process handler), which is the opposite of invisible",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/entry/compose/plugin.ts":
          "export function on(refs: R[]): void {\n  void (async (): Promise<void> => {\n    await Promise.all(refs.map((h) => invoke(h).catch(() => undefined)));\n  })();\n}\n",
      },
      why: "DECLARED LIMIT: only STATEMENT position counts. An absorber nested inside an argument (the per-item `.catch` of a `Promise.all` map) is a different, per-item concern — the statement itself still rejects loudly",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/settings/context.ts":
          "export function serialize(): void {\n  const tail = next.catch(() => undefined);\n  chains.set(id, tail);\n}\n",
      },
      why: "DECLARED LIMIT: the absorbing `.catch` must be at STATEMENT position — an absorbed promise ASSIGNED to a variable (the live per-user write-chain serializer) is a value someone still holds, not detached work",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/engine/engine.ts":
          "export function fire(deps: D): void {\n" +
          "  void withRequestSpan(id, NAME, {}, async () => {\n" +
          "    try {\n      await deps.build();\n    } catch (err) {\n      try {\n        await deps.emit(w);\n" +
          "        // @swallowed-ok(emitErr): a failed WARNING emit must never mask the build error the outer catch rethrows. Ends if the emit becomes retryable.\n" +
          "      } catch (emitErr) {\n        void emitErr;\n      }\n      throw err;\n    }\n  }).catch(() => undefined);\n}\n",
      },
      why: "the live nested case: an INNER catch absorbing a failed warning-emit while the OUTER one rethrows. The marker names the inner binding, so the outer catch is not laundered by it",
    },
    {
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/engine/engine.ts":
          "export function run(deps: D): void {\n  try {\n    deps.build();\n  } catch (err) {\n    log.warn({ err });\n  }\n}\n",
      },
      why: "DECLARED LIMIT for A2: a swallowing catch OUTSIDE any span callback is out of scope — nothing is being sealed `ok`, so it is ordinary error handling, not a lying trace",
    },
  ],
};
