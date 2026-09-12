// Policy: detached-work-traced — fire-and-forget work whose FAILURE IS INVISIBLE. Two arms of ONE class
// that recurred SIX times in this tree: statement-position work that absorbs its own error must open its
// own SUPERVISED DETACH boundary (A1), and a catch inside such a span must not swallow, or the span seals
// `status:"ok"` on every failure (A2). Sibling trap, NOT enforced here: the STRING form of `.evaluate`
// silently drops its `arg` — a different failure, same "reads as nothing" shape.
//
//   A1 untraced            — an ExpressionStatement (`void x.y().catch(() => undefined)`, or the same
//                            without `void`) whose chain ends in a DISCARDING rejection handler — an
//                            empty/constant-returning arrow, i.e. the error is thrown away and nothing at
//                            all happens — and whose statement calls NO derived supervised-detach boundary.
//                            The request root has already sealed by the time this work runs, so the failure
//                            reaches no log, no trace and no caller: invisible by construction.
//   A2a swallowed-catch    — INSIDE a derived span opener's callback, a CatchClause whose block does not
//                            RETHROW. `withRequestSpan` seals OK unless the callback rejects, so a
//                            warn+emit+return catch paints the trace dashboard green while the work fails.
//   A2b blinded-rejection  — a DISCARDING `.catch(…)` NESTED inside an opener callback, which blinds the
//                            span exactly as a non-rethrowing catch does. The same absorber attached
//                            OUTSIDE the opener call is the CORRECT shape and is never seen here.
//
// FAMILY `detached-work-traced`, reader `lib/detached-work.ts` — `deriveRootSpanOpeners` (shared with the
// `-health` sibling) plus the three per-node verdicts `untracedDispatchSite` / `swallowingCatchSite` /
// `blindedRejectionSite`. The reader is handed nodes the ONE shared walk delivered, exactly as
// `lib/caught-failure.ts` is handed `CatchClause`/`CallExpression`: no walk, no cache, no private parser
// survives in this module.
//
// THE SPLIT, AND WHY IT IS AN AUTHORITY SPLIT RATHER THAN A TASTE ONE. The legacy descriptor carried four
// arms under one name. A4 (ZERO derived openers ⇒ RED) is a blindness tripwire that must never be waivable,
// and A1/A2 are occurrences a deliberate teardown may waive with a reason and an end condition. §12.1
// allows ONE authority per descriptor, so A4 moved to `detached-work-traced-health` under the identical
// family string. A3 — the private `@swallowed-ok` marker's own stale/malformed reporting — is RETIRED
// rather than moved; see the marker census below.
//
// POPULATION PORT: legacy `scanRoot: (p) => p.includes("packages/server/src/")` → `"@server"`, which
// resolves to exactly `packages/server/src/`. Byte-identical. Server source only, deliberately: the
// request-span ring is a server concern, and `tests/` fires and forgets constantly with no ring to be
// invisible on. The legacy `includes`-not-`startsWith` spelling was defensive against a path-format
// mismatch producing a SILENT GREEN; the population manifest removes the class, so the defence is deleted
// rather than ported.
//
// `execution: "entire-population"`: the opener VOCABULARY is derived from another file entirely, so a
// narrowed subset that excludes `foundation/observability/tracing.ts` would judge every statement against
// an empty vocabulary and report the whole server as untraced.
//
// ── MARKER CENSUS (§8.6), and the private `@swallowed-ok(<position>)` grammar is RETIRED ────────────────
// §12.5 bans a gate-specific exemption grammar, so the two-sided marker — its exact-position parser, its
// STALE arm, its MALFORMED arm and the `_2` disambiguator — is deleted and replaced by the central
// `@orb-waive detached-work-traced(<position>)`. The central engine already reports malformed, unknown,
// stale, dead-position, over-broad and duplicate markers, which is A3's whole job done once for every
// policy; the successor proof is the `mustPass` identity row below plus
// `tests/tooling/verify/lib/ordinary-waiver.test.ts`.
//
// Per-file reconciliation, re-derived at conversion rather than quoted (the review layer's count of 8 is
// the UNION of two different grammars — see the lens note below — and the real verifier-form count is 5):
//
//   packages/server/src/infra/providers/backends/local-light/model-cache.ts   legacy 1 → current 1
//   packages/server/src/domain/automation/substrate/serial-lanes.ts           legacy 1 → current 1
//   packages/server/src/domain/chat/engine/engine.ts                          legacy 2 → current 2
//   packages/server/src/transport/rate-limit.ts                               legacy 1 → current 1
//   TOTAL                                                                     legacy 5 = current 5
//
// Every file is `current == legacy`: no MULTI split, no drop, no dead marker. Gate self-quotes and proof
// fixtures are excluded from the count per §8.6 (`verify/gates/**`, `verify/lib/**`,
// `tests/tooling/verify/lib/**`), as are the two `caught-failure-ownership` proof fixtures that spell the
// retired grammar inside a string.
//
// THE `@swallowed-ok` SPELLING SURVIVES, WITH EXACTLY ONE OWNER, AND IT IS NOT THIS FAMILY.
// `tooling/src/ast/ops/swallowed.ts:34` is a SEPARATE consumer with a DIFFERENT grammar —
// `/@swallowed-ok:\s*\S/u`, which requires a colon IMMEDIATELY after the tag and therefore cannot match the
// positioned form this policy used to read. Its subject is disjoint too: leading comments of EXPORTED
// declarations under `packages/`, skipping test files. Measured at conversion: its ONE live marker is
// `packages/db/src/schema/relations.ts:20`, and none of the five translated sites is in its scope. So the
// translation above cannot change the lens verdict, the lens is retained UNCHANGED, and the spelling now
// has a single owner. (The review layer's "six shared source files" is the UNION of both grammars' files,
// not an intersection — no file carries both forms.)
//
// ── POSITIONS, AND THE DOOR THAT DID NOT EXIST (§3: "ordinary is a claim about the door") ───────────────
// The legacy descriptor passed `token: site.position, offset: 0` with the reported node being the whole
// ExpressionStatement or CatchClause. Under the final contract `report.node` VALIDATES the token against
// the node's own text at the declared offset, so every one of those would have THROWN — `onUserCommit` is
// not at offset 0 of `void ctx.rpg.onUserCommit(a, b).catch(() => undefined);`. Worse, the `_2`
// disambiguator and the `detached` fallback were SYNTHETIC strings that appear nowhere in the source, so
// `locateFinding` could never have bound a waiver to them either.
//
// Every position now comes from `lib/caught-failure.ts`'s anchor contract, through the shared reader: an
// exact slice of the reported node at a byte offset, widest identity first (the whole callee chain, then
// its member name), rejecting any candidate carrying a paren, a newline or a solidus. Where no candidate
// anchors, the policy passes NO token and the runtime derives one from the node's first authored
// identifier/literal/keyword. The `_2` disambiguator is therefore GONE and unreplaceable: two same-named
// dispatches on one line are now separated by the central engine's own carrier containment, which binds a
// marker to the leading trivia of ONE statement and its ancestors up to the enclosing statement — the
// sibling on the same line after a `;` has no leading trivia to bind. mustFlag[6] pins that, and it is the
// one behavioural claim this conversion measured rather than assumed.
//
// ── DECLARED LIMITS (each with a mustPass row) ──────────────────────────────────────────────────────────
// Promise links are read through `literalMember`, so `p.catch` and `p["catch"]` (literal, parenthesized,
// literal-typed, `+`-concatenated, or a same-file `const`) are the SAME read; a dynamic key stays a
// declared limit rather than a guess. A1 reads only DISCARDING handlers: a handler that logs, cleans up or
// rethrows is out of scope (it is visible), and so is a bare `void work()` with no handler at all (an
// unhandled rejection is loud). Only STATEMENT position counts — an absorber nested inside an argument is
// not the class, and an absorbed promise ASSIGNED to a variable is a value someone still holds. "Traced" is
// satisfied by ANY opener call anywhere in the statement (deliberately permissive: proving the opener wraps
// THE work needs types this syntactic reader does not have). A2 reads only a syntactic `throw` that escapes
// the catch block — a rethrow through a helper call is invisible to it. And the family cannot prove a span
// is MEANINGFUL: that its name, id or attributes correlate to the work it wraps. It proves a root is opened
// and that errors reach it; a wrong-but-present span passes.
//
// §4.6 DIFFERENTIAL: the pre-conversion descriptor at `86ce80b6c` replayed through the legacy dispatcher
// against the final SPLIT PAIR, both over the real `packages/server/src/**` corpus and fixture-level over
// every legacy example. The result, with each difference classified, is in the landing commit message.
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { DetachedWorkSite } from "../lib/detached-work.ts";
import { blindedRejectionSite, deriveRootSpanOpeners, swallowingCatchSite, TRACING_MODULE, untracedDispatchSite } from "../lib/detached-work.ts";

const MESSAGE =
  "fire-and-forget work whose FAILURE IS INVISIBLE. Detached work outlives the request that dispatched it: " +
  "by the time it runs, the request root span has sealed, so a PARENTED span is dropped as a late orphan and " +
  "an absorbed rejection reaches no log, no trace, and no caller. And a catch inside a detached root that " +
  'does not rethrow seals that root `status:"ok"` on EVERY failure — the trace dashboard shows green while ' +
  "the work fails. This class recurred six times after it had already been fixed once " +
  "(packages/server/src/foundation/observability/tracing.ts).";

const FIX =
  "prefer await/return so the caller owns completion and ordering. Only work that explicitly promises NO " +
  "ordering may use `superviseDetached(<ownRequestId>, <spanName>, <attrs>, () => work())` — keyed by its OWN " +
  "id, with an operation FACTORY so work starts inside the detached root. Inside that callback, a catch that " +
  "warns/emits must RETHROW afterwards so the span marks ERROR; the supervisor owns the terminal rejection " +
  "and emits its structured operator-visible error. If the work genuinely has nothing to trace and no caller " +
  "to inform (a stream teardown, a cache eviction), waive it with " +
  "`// @orb-waive detached-work-traced(<position>): <why it is invisible on purpose + what would end the " +
  "exemption>` on the line above — the POSITION is the guarded WORK's own text: the whole callee chain " +
  "(`entry.promise`, `a.cancel`) or, where that chain carries a paren or a newline, just its member name " +
  "(`where`); for a swallowing catch it is the caught BINDING (`err`) or the keyword `catch` when the clause " +
  "is bindingless. It is never the `.catch` link and never the statement.";

/** Report one site, using the shared anchor when the marker grammar can hold it and letting the runtime
 *  derive a position when it cannot. */
function reportSite(ctx: GatePolicyContext, site: DetachedWorkSite | undefined): void {
  if (site === undefined) {
    return;
  }
  const details = { message: MESSAGE, fix: FIX };
  if (site.anchor === undefined) {
    ctx.report.node(site.node, details);
    return;
  }
  ctx.report.node(site.node, { ...details, token: site.anchor.token, offset: site.anchor.offset });
}

export const gate = defineGate({
  id: "detached-work-traced",
  family: "detached-work-traced",
  authority: "ordinary",
  severity: "error",
  population: "@server",
  // `literalMember` resolves a bracket key through its literal TYPE, so a `const link = 'catch' as const`
  // key is the same read as `.catch` — that is a checker question, not a syntactic one.
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const statements: Node[] = [];
    const clauses: Node[] = [];
    const calls: Node[] = [];
    return {
      visitors: [
        { kinds: [SyntaxKind.ExpressionStatement], visit: (node): void => void statements.push(node) },
        { kinds: [SyntaxKind.CatchClause], visit: (node): void => void clauses.push(node) },
        { kinds: [SyntaxKind.CallExpression], visit: (node): void => void calls.push(node) },
      ],
      evaluate: (): void => {
        const openers = deriveRootSpanOpeners(ctx.files);
        if (openers.size === 0) {
          // The vocabulary is empty, which is the `-health` sibling's finding and speaks for the whole run;
          // per-file findings derived from an empty vocabulary would be noise on top of it.
          return;
        }
        for (const statement of statements) {
          reportSite(ctx, untracedDispatchSite(statement, openers));
        }
        for (const clause of clauses) {
          reportSite(ctx, swallowingCatchSite(clause, openers));
        }
        for (const call of calls) {
          reportSite(ctx, blindedRejectionSite(call, openers));
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/verbs/turn.ts": "export function fire(ctx: C): void {\n  void ctx.rpg.onUserCommit(a, b).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, line: 2, token: "ctx.rpg.onUserCommit" },
      why: "A1, THE FOUNDING SHAPE verbatim — the live `fireRpgUserCommit` this family found on landing: a background snapshot-commit whose rejection is discarded, outside any span. The position is the whole callee CHAIN (widest identity first), which is also the position `caught-failure-ownership` reports at the same site, because both now read it through `lib/caught-failure.ts`'s one anchor contract",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/verbs/bracket.ts":
          "export function fire(ctx: C): void {\n" +
          "  const link = 'catch' as const;\n" +
          "  let typedLink: 'catch' = 'catch';\n" +
          "  void ctx.save()['catch'](() => undefined);\n" +
          "  void ctx.save()?.['then'](undefined, () => undefined);\n" +
          "  void ctx.save()[('catch')](() => undefined);\n" +
          "  void ctx.save()[link](() => undefined);\n" +
          "  void ctx.save()[typedLink](() => undefined);\n" +
          "  void ctx.save()[(('ca' + 'tch') as 'catch')](() => undefined);\n" +
          "  void ctx.save()['ca' + 'tch'](() => undefined);\n" +
          "  void ctx.save()['th' + 'en'](undefined, () => undefined);\n}\n",
      },
      expect: { count: 8 },
      why: "literal, parenthesized-literal, literal-typed, concatenated and optional-bracket promise links are the same invisible detached dispatch as dot access — a dot-only reader goes silently green on every one of them. This is also the row that makes `analysis: \"types\"` load-bearing: `const link = 'catch' as const` is resolved through its literal TYPE",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n" +
          "export function superviseDetached(id: string, name: string, attrs: A, fn: () => Promise<void>): void {\n" +
          "  withRequestSpan(id, name, attrs, fn).catch((err) => log.error({ err }));\n}\n",
        "packages/server/src/domain/chat/engine/engine.ts":
          "export function fire(deps: D): void {\n" +
          "  superviseDetached(id, NAME, {}, async () => {\n" +
          "    try {\n      await deps.build();\n    } catch (err) {\n      log.warn({ err }, 'failed');\n    }\n  });\n}\n",
      },
      expect: { count: 1, token: "err" },
      why: "A2a plus the WRAPPER-DERIVATION plant: a swallowed rejection inside the supervised operation still seals the root `ok`, and deriving only DIRECT root openers would miss this fixture entirely — `superviseDetached` reaches the vocabulary through the fixpoint. The position is the caught binding",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/entry/compose/search-discovery.ts":
          "export function enqueue(w: W): void {\n" +
          "  void withRequestSpan(id, NAME, {}, async () => {\n    await w.start(a).catch(() => undefined);\n  }).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, token: "w.start" },
      why: "A2b — moving the discard INSIDE the callback would be the obvious way to 'fix' A1 while keeping the span permanently green. The span can only mark ERROR if the rejection reaches it. The OUTER absorber on the opener call is the correct shape and is deliberately not a second finding",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/egress.ts":
          "export function tear(res: R): void {\n  // @swallowed-ok\n  void res.body.cancel().catch(() => undefined);\n}\n",
      },
      expect: { count: 1, token: "res.body.cancel" },
      why: "THE SUCCESSOR to the legacy MALFORMED-MARKER arm (§4.6, classified): a bare `@swallowed-ok` used to produce TWO findings here — the dispatch, plus a malformed-marker finding of the gate's own. The private grammar is retired, so the comment is now inert TEXT and only the dispatch reds. Malformed-marker reporting is the central engine's, once, for every policy (tests/tooling/verify/lib/ordinary-waiver.test.ts)",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/egress.ts":
          "export function tear(a: R, b: R): void {\n" +
          "  // @orb-waive detached-work-traced(a.cancel): the first stream is already closed. Ends if cancel becomes user-visible.\n" +
          "  void a.cancel().catch(() => undefined); void b.destroy().catch(() => undefined);\n}\n",
      },
      expect: { count: 1, token: "b.destroy" },
      why: "THE REASON THE POSITION IS THE WORK, not the line — two dispatches on ONE line: the named `a.cancel` is waived and `b.destroy` beside it is still RED. A line-scoped marker would have laundered both",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/repeated-cancel.ts":
          "export function tear(a: R, b: R): void {\n" +
          "  // @orb-waive detached-work-traced(a.cancel): the first stream is already closed. Ends if cancel becomes user-visible.\n" +
          "  void a.cancel().catch(() => undefined); void b.cancel().catch(() => undefined);\n}\n",
      },
      expect: { count: 1, token: "b.cancel" },
      why: "THE SAME-NAME CASE, and the one behavioural claim of this conversion that was MEASURED rather than assumed. The legacy gate minted a synthetic `cancel_2` position so one reason could not absolve its sibling; `_2` appears nowhere in the source, so under the final contract it is both unanchorable and unwaivable. The separation now comes from the CALLEE CHAIN (`a.cancel` vs `b.cancel`) plus the central engine's carrier containment — the marker binds to the leading trivia of the FIRST statement, and the sibling after the `;` has none. The row reds if either mechanism is lost",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n" +
          "export function superviseDetached(id: string, name: string, attrs: A, fn: () => Promise<void>): void {\n" +
          "  withRequestSpan(id, name, attrs, fn).catch((err) => log.error({ err }));\n}\n",
        "packages/server/src/domain/chat/engine/engine.ts":
          "export function fire(ctx: C): void {\n  superviseDetached(reqId(t), SPAN, { chatId }, () => ctx.rpg.onTurnAborted(c, t, r));\n}\n",
      },
      why: "THE EXPLICIT SUPERVISED-DETACH CONTRACT: the operation factory starts inside a detached root and the boundary owns the terminal rejection without a raw `void promise`",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n" +
          "export function superviseDetached(id: string, name: string, attrs: A, fn: () => Promise<void>): void {\n" +
          "  withRequestSpan(id, name, attrs, fn).catch((err) => log.error({ err }));\n}\n",
        "packages/server/src/domain/chat/engine/engine.ts":
          "export function fire(deps: D): void {\n" +
          "  superviseDetached(id, NAME, {}, async () => {\n" +
          "    try {\n      await deps.build();\n    } catch (err) {\n      log.warn({ err }, 'failed');\n      throw err;\n    }\n  });\n}\n",
      },
      why: "THE A2 FIX: warn (or emit) and then RETHROW — the span marks ERROR and the supervisor owns the terminal rejection",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/egress.ts":
          "export function tear(res: R): void {\n" +
          "  // @orb-waive detached-work-traced(res.body.cancel): a teardown of an already-failed egress stream — no work to trace, no caller to inform. Ends if it ever does traceable work.\n" +
          "  void res.body.cancel().catch(() => undefined);\n}\n",
      },
      why: "POSITIONAL IDENTITY (§4.2's twin), and the SUCCESSOR to the retired `@swallowed-ok(<position>)` grammar: the deliberate-invisibility escape with its reason and end condition, now spoken in the one central vocabulary. The position is the whole callee chain, which is authored code and therefore survives `locateFinding`'s comment blanking. The fixture produces exactly ONE finding for the one marker to consume — the live egress-teardown class, where the reason is the deliverable and the silence is not",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/infra/network/bracket-egress.ts":
          "export function tear(res: R): void {\n" +
          "  // @orb-waive detached-work-traced(res.body.cancel): an already-closing stream has no caller; ends if cancellation gains a visible result.\n" +
          "  void res.body.cancel()['catch'](() => undefined);\n}\n",
      },
      why: "the BRACKET-linked absorber reaches the SAME exact-position marker — the widened link reader must not leave a detected shape unexemptable",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/entry/lifecycle.ts":
          "export function boot(s: S): void {\n  void s.drain().catch((err: unknown) => log.error({ err }, 'drain failed'));\n}\n",
      },
      why: "DECLARED LIMIT: only a DISCARDING handler counts. A handler that logs is already visible — the defect is invisibility, not fire-and-forget itself. Cut `isDiscardingHandler` and this row reds",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/transport/jobs/worker.ts": "export function boot(deps: D): void {\n  void reapOnce(deps);\n}\n",
      },
      why: "DECLARED LIMIT: a bare `void work()` with NO handler is out of scope — an unhandled rejection is loud (it reaches the process handler), which is the opposite of invisible",
    },
    {
      mode: "types",
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
      mode: "types",
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
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/engine/nested.ts":
          "export function fire(deps: D): void {\n" +
          "  void withRequestSpan(id, NAME, {}, async () => {\n" +
          "    try {\n      await deps.build();\n    } catch (err) {\n      try {\n        await deps.emit(w);\n" +
          "        // @orb-waive detached-work-traced(emitErr): a failed WARNING emit must never mask the build error the outer catch rethrows. Ends if the emit becomes retryable.\n" +
          "      } catch (emitErr) {\n        void emitErr;\n      }\n      throw err;\n    }\n  }).catch(() => undefined);\n}\n",
      },
      why: "the live NESTED case: an INNER catch absorbing a failed warning-emit while the OUTER one rethrows. The marker names the inner BINDING, so the outer catch is not laundered by it — the translated form of the real `domain/chat/engine/engine.ts` site",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/engine/outside.ts":
          "export function run(deps: D): void {\n  try {\n    deps.build();\n  } catch (err) {\n    log.warn({ err });\n  }\n}\n",
      },
      why: "DECLARED LIMIT for A2: a swallowing catch OUTSIDE any span callback is out of scope — nothing is being sealed `ok`, so it is ordinary error handling, not a lying trace",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/client/src/features/chat/detach.ts": "export function fire(ctx: C): void {\n  void ctx.rpg.onUserCommit(a, b).catch(() => undefined);\n}\n",
      },
      why: "THE POPULATION FENCE, and the only row that dies without it: mustFlag[1] byte-for-byte, moved to `@client`. The request-span ring is a SERVER concern; a browser dispatch has no per-requestId bucket to be invisible on. The tracing-module fixture doubles as the in-population anchor, without which the row would admit zero paths and raise a population TOOL ERROR instead of proving the fence",
    },
  ],
});
