// Policy: caught-failure-ownership — a SYNTACTICALLY handled rejection is not ownership. Reports UNPROVEN
// OWNERSHIP (never "bug") for three arms over every authored runtime source file: a discarded promise
// rejection handler, a catch with no owning continuation, and a silent DEFAULT return. The policy rewards
// RUNTIME ownership, not syntax cosplay — every owner is provenance-checked.
//
// ── FAMILY ──────────────────────────────────────────────────────────────────────────────────────────────
// `caught-failure-ownership`, on the shared reader `lib/caught-failure.ts`
// (`catchClauseSite` / `promiseAbsorberSite` / `caughtFailureReviewSites`); this policy is its only gate consumer.
//
// ── ONE POLICY ID, DELIBERATELY — the arms do NOT split ──────────────────────────────────────────────────
// §12.1 splits a module on AUTHORITY or SEVERITY. All three arms are `ordinary`/`error` and share the
// population, the analysis plane and the entire ownership classifier, so the smallest complete contract
// (§5b.1) is one id. The census row's `X` authority is its CUSTOM MARKER (`@swallowed-ok`, see the marker
// census below), not mixed authority; the census files this gate under "File-hook", never under "Mixed".
// And the id is load-bearing in a way that is easy to miss: 574 live markers across 335 files NAME it, so
// keeping it stable is a correctness property of this conversion rather than a convenience — a split would
// have multiplied the translation across every one of those sites. Arm identity survives instead in the
// per-finding `message` (`ARM_MESSAGE`), which is a mapped Record so a fourth arm fails `tsc`.
//
// ── THE POSITION IS AN EXACT SOURCE SLICE, AND THAT RETIRED A PRIVATE VOCABULARY ─────────────────────────
// The legacy grammar was `@orb-gate-ignore caught-failure-ownership(<promise:save|empty:err|default:catch>)`
// — synthetic labels. The central engine binds a waiver by carrier containment AND
// `finding.token === marker.position` (lib/ordinary-waiver.ts:504,537), where the token must be the exact
// authored slice the finding's own line/column points at (:420,:428). There is NO function from the old
// vocabulary to such a slice, so every position was RE-DERIVED from what this policy actually reports:
// `empty:err`/`default:err` → `err` (the caught binding), `empty:catch`/`default:catch` → `catch` (the
// keyword, for a bindingless clause), `promise:save` → `save` or `a.save` (the WORK's callee text, never
// the plumbing link). The anchoring rules and the underivable-anchor fallback live in the reader's header.
// The retired `promise:save_2` suffix has no successor and needs none: two absorbers in one statement are
// separately waivable when their callee chains differ (`a.save` vs `b.save`), which is the engine's real
// predicate, and a genuinely identical pair is UNWAIVABLE by construction (§4.2) rather than by a label.
//
// ── MARKER CENSUS (translated in this commit) ────────────────────────────────────────────────────────────
// 574 live `@orb-gate-ignore caught-failure-ownership(<position>)` markers in 335 files at the base commit
// (576 raw matches minus the two `<reported-position>` PROSE occurrences in this module's own `FIX` string
// and header — a self-match that has produced false census counts in this program before; exclude
// `tooling/src/verify/gates/caught-failure-ownership.ts` itself). Legacy position prefixes: 268 `empty`,
// 164 `default`, 142 `promise`. Every one was re-emitted as `@orb-waive caught-failure-ownership(<token>)`
// with its reason carried VERBATIM, where `<token>` came from joining the marker's LOCATION to the finding
// this policy really produces there — never from a text rule on the old label. Dead markers (a marker with
// no finding at its site) were DELETED, never converted into a waiver for an unmarked finding (§8.6).
//
// ── RETIRED ARM: `@swallowed-ok` IS NO LONGER A SUPPRESSION DOOR HERE (§4.6, classified) ─────────────────
// The legacy gate accepted a live exact-position `@swallowed-ok` marker owned by a sibling gate as ownership
// evidence. That arm is gone: it was a cross-GATE import and a PRIVATE MARKER PARSER for another gate's custom
// grammar, which §12.5 bans outright ("no gate-specific exemption grammar"). Every `@swallowed-ok` marker stays
// exactly where it is and keeps its own owner; the five sites it covered now carry an `@orb-waive` marker
// of this policy's own, with the `@swallowed-ok` reason carried verbatim. Two markers, each stale-checked
// by the engine that owns it.
//
// ── WHAT PASSES, AND WHY IT IS ALL PROVENANCE ───────────────────────────────────────────────────────────
// The ownership vocabulary is the reader's header — it is the reader's law, not this module's. In one line:
// propagation (rethrow, discriminated or guarded rethrow, `{ cause }` chaining, a `never`/`Promise<never>`
// call, a native `Promise.reject` of the binding), the governed operator surfaces (pino/`getLog` structured
// log, `securityEvent`, `withRequestSpan`, `notify`/toast with non-success copy), observable state (a genuine
// React setter slot, TanStack query/form, `createEntityMutation`'s `errorToast`, also on a hook imported as a
// `const`, and owning a try whose sole statement is that operation), and an error-as-data outcome a real
// consumer reads, including a typed refusal. Every one is provenance-checked; a success discriminator REFUSES.
//
// ── POPULATION PORT ─────────────────────────────────────────────────────────────────────────────────────
// Legacy `scanRoot` was `/^packages\/[^/]+\/src\//.test(path) || path.startsWith("tooling/src/")` — every
// package's `src`, plus `tooling/src`. `["@packages", "@tooling"]` is NOT that set: `@packages` is a
// frozen six-root snapshot. The generic `@product` classification now includes every shipped product
// package (`@showcase`, `@default-content`, and `@inference` included), so `["@product", "@tooling"]` states the
// legacy reach without duplicating package roots. Removing a shipped package from `@product` would silently
// dead-letter its markers; the population-fence proof below keeps showcase reach live.
// The `{ of: "all", notUnder: [...] }` spelling was tried FIRST and rejected as
// dishonest: `of: "all"` admits whatever the invocation's candidate set happens to hold, which on the real
// tree excludes `packages/client/vite.config.ts` only because `harnessGlobs` never loads it — the declared
// limit's own mustPass row is what caught it.
//
// ── DECLARED LIMITS (each with a proof row) ─────────────────────────────────────────────────────────────
// Eight, each AUDITED against the module rather than carried as a claim (§4.1 — a limit without a row is the
// defect this program keeps finding). A limit that cuts toward a false positive is proven by a mustFLAG:
//   · a dynamically-keyed rejection link is unreadable, not assumed — `dynamic-rejection-key` mustPass, ADDED
//     here; the bracket mustFlag row only ever proved the nine STATICALLY resolvable spellings.
//   · zod's `.catch()` combinator is schema construction, not a promise — `zod-catch` mustPass.
//   · package build/config files outside `packages/<name>/src`, and `tests/` + `scripts/` — the population-fence
//     mustPass, which carries all three excluded coordinates plus its required in-population anchor.
//   · a rethrow or owner routed through an OPAQUE (multi-statement) HELPER is invisible to a syntactic reader — this one is a
//     KNOWN FALSE POSITIVE, so its honest proof is the `opaque-rethrow-helper` mustFLAG, ADDED here. The
//     catalogue claimed a mustPass for it; a mustPass would have been a lie about which way the limit cuts.
//   · a mutation owner behind a wrapper hook's returned function, an injected save, or a local wrapper is
//     not expanded, and a try doing more than the governed operation is not a sole-operation owner —
//     the indirect-mutation-owners mustFLAG.
//   · a function-valued `errorToast` may return null, which shows no toast — the function-toast mustFLAG.
//   · the typed-refusal read takes `ok` through `literalValue`, which is undefined for a boolean, so a
//     multi-statement helper typed `{ ok: false }` is not a typed refusal — the boolean-typed-refusal mustFLAG.
//   · a guarded rethrow's guard must read the caught binding, but how narrow the guard is stays unjudged —
//     the guard-narrowness mustPass (credited by design) beside the fooled-guarded-rethrow mustFlag.
//
// The legacy `caught-failure-ownership` descriptor ((pruned from public history)) carried
// the `@orb-gate-ignore` grammar named above and its own inline three-arm reader before this conversion
// extracted `lib/caught-failure.ts`.
//
// RE-SPELLED 2026-09-20 (lane cb-population-truth, #2488) from explicit package roots to `@product` plus
// the then-excluded content packages. The 2026-09-21 owner decision classifies both shipped content
// packages into `@product`, making those explicit refs redundant while keeping the intended corpus. The
// expression now lives in `lib/caught-failure.ts#CAUGHT_FAILURE_POPULATION` (work item 0009).
import type { Node } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { withinClosureBound } from "../../floor/code-facts/bounded-closure.ts";
import type { CaughtFailureArm } from "../contract/caught-failure.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { CaughtFailureSite } from "../lib/caught-failure.ts";
import { CAUGHT_FAILURE_POPULATION, caughtFailureSite } from "../lib/caught-failure.ts";

import { nativeFailureRead } from "../lib/caught-failure-native.ts";

const MESSAGE =
  "UNPROVEN OWNERSHIP for a caught failure. A syntactically handled rejection can still erase a user or operator failure: an empty catch, a discarded promise rejection, or an undocumented default says nothing about who owns the failure or how it is surfaced. (tooling/src/verify/gates/GATE-AUTHORING.md)";

/** The arm-specific diagnosis. A mapped Record over the reader's ONE arm tuple, so a fourth arm is a `tsc`
 *  error here rather than a silently generic finding. */
const ARM_MESSAGE: Readonly<Record<CaughtFailureArm, string>> = {
  default: `${MESSAGE} THIS SITE: a catch whose only escape is a constant fallback — the behaviour changed and nobody was told.`,
  empty: `${MESSAGE} THIS SITE: a catch block (and its finally) that names no owner at all.`,
  promise: `${MESSAGE} THIS SITE: a promise rejection handler that discards the failure.`,
};

const FIX =
  "make the owner machine-visible: propagate; set error/terminal/form/query state; emit a contextual structured log/span; or route through a named owner boundary. For a deliberately safe fail-closed, cleanup, or outer-engine absorber, add `// @orb-waive caught-failure-ownership(<position>): <owner/surface or why safe + end condition>` immediately above the guarded try/catch or promise statement. THE POSITION IS THE EXACT SOURCE SLICE THIS POLICY REPORTS AT, never a label: for a catch arm it is the caught binding's name (`err`, `error`, `e`) or the keyword `catch` when the clause is bindingless — and a catch NESTED inside another guarded try binds a name of its own (`disableError`, never a second `error`), because the outer marker binds by containment and a shared token makes it over-broad; for a promise arm it is the guarded WORK's callee text and never the plumbing link — `save` for `save().catch(h)`, `a.save` for `a.save().catch(h)`, `p` for `p.catch(h)`. Do not add a marker where a real toast/state/log/terminal path is required.";

function reportSite(ctx: GatePolicyContext, site: CaughtFailureSite | undefined): void {
  if (site === undefined) {
    return;
  }
  const anchor = site.anchor;
  if (anchor === undefined) {
    ctx.report.node(site.node, { message: ARM_MESSAGE[site.arm] });
    return;
  }
  ctx.report.node(site.node, { message: ARM_MESSAGE[site.arm], token: anchor.token, offset: anchor.offset });
}

// A multi-statement handler that owns its failure through `reportError`, handed over by one `statement`.
const REPORTING_HANDLER = (statement: string): Readonly<Record<string, string>> => ({
  "packages/client/src/features/probe/handler-spelling.ts": `declare function note(message: string): void;\nfunction onErr(error: unknown): void {\n  const message = String(error);\n  globalThis.reportError(error);\n  note(message);\n}\nexport function run(p: Promise<void>): void {\n  ${statement}\n}\n`,
});
const HANDLER_SPELLINGS = [
  "void p.catch(onErr as (error: unknown) => void);",
  "void p.catch((onErr));",
  "const h = (onErr); void p.catch(h);",
  "void Reflect.apply(p.catch, p, [onErr]);",
  "void p.catch.apply(p, [onErr]);",
] as const;

export const gate = defineGate({
  id: "caught-failure-ownership",
  family: "caught-failure-ownership",
  authority: "ordinary",
  severity: "error",
  population: CAUGHT_FAILURE_POPULATION,
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const nominees: Node[] = [];
    const native = nativeFailureRead(ctx, () => nominees);
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CatchClause, SyntaxKind.CallExpression],
          visit: (node): void => {
            nominees.push(node);
          },
        },
      ],
      prepare: native.prepare,
      evaluate: (): void => {
        for (const node of nominees) {
          const reads = native.at(node.getSourceFile());
          const verdict = withinClosureBound(() => caughtFailureSite(node, reads));
          if (verdict.kind === "unresolved") {
            ctx.report.analysis(node, { kind: "unknown", reason: verdict.reason });
          } else {
            reportSite(ctx, verdict.value);
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/shadowed-native-reporter.ts":
          "export function shadowed(p: Promise<void>, globalThis: { reportError: (error: unknown) => void }): void {\n  const report = globalThis.reportError;\n  void p.catch(globalThis.reportError);\n  void p.catch(globalThis['reportError']);\n  void p.catch(report);\n}\n",
      },
      expect: { count: 3, token: "p" },
      why: "a shadowed globalThis does not turn direct, computed, or aliased reporter callbacks into the native exception surface",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/unowned-reporter-callbacks.ts":
          "export function unowned(p: Promise<void>, other: { reportError: (error: unknown) => void }): void {\n  void p.catch(other.reportError);\n  void p.catch(globalThis?.reportError);\n  let report = globalThis.reportError;\n  report = () => undefined;\n  void p.catch(report);\n}\n",
      },
      expect: { count: 3, token: "p" },
      why: "an arbitrary receiver, optional member, or reassigned native alias does not prove an unconditional native exception owner",
    },
    {
      mode: "types",
      files: { "packages/client/src/features/probe/raw.ts": "export function raw(): void {\n  void save().catch(() => undefined);\n}\n" },
      expect: { count: 1, token: "save" },
      why: "an unowned raw promise absorber is syntactically handled but has no failure owner",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/bracket.ts":
          "export function bracket(p: Promise<void>): void {\n  const link = 'catch' as const;\n  let typedLink: 'catch' = 'catch';\n  void p['catch'](() => undefined);\n  void p['then'](undefined, () => undefined);\n  void p?.['catch'](() => undefined);\n  void p[('catch')](() => undefined);\n  void p[link](() => undefined);\n  void p[typedLink](() => undefined);\n  void p[(('ca' + 'tch') as 'catch')](() => undefined);\n  void p['ca' + 'tch'](() => undefined);\n  void p['th' + 'en'](undefined, () => undefined);\n}\n",
      },
      expect: { count: 9, token: "p" },
      why: "literal, parenthesized-literal, literal-typed, and optional-bracket rejection links are the same property reads as dot access; dynamic string keys remain out",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/indirect-promise-invocation.ts":
          "export function indirectInvocation(p: Promise<void>): void {\n  p.catch.call(p, () => undefined);\n  p.then.call(p, undefined, () => undefined);\n  const recover = p.catch.bind(p);\n  recover(() => undefined);\n  Promise.prototype.catch.call(p, () => undefined);\n  Reflect.apply(p.catch, p, [() => undefined]);\n  p.catch.apply(p, [() => undefined]);\n  p.then.apply(p, [undefined, () => undefined]);\n}\n",
      },
      expect: { count: 7, token: "p" },
      why: "call/bind invocation of the native rejection link has the same absorbing semantics as direct method syntax",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/nullable-promise.ts":
          "export function nullablePromise(p: Promise<void> | undefined): void {\n  void p?.catch(() => undefined);\n  void p?.['catch'](() => undefined);\n}\n",
      },
      expect: { count: 2, token: "p" },
      why: "optional access changes whether the link runs, not whether a present Promise rejection is absorbed",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/probe/empty.ts": "export function empty(): void {\n  try { risky(); } catch {}\n}\n" },
      expect: { count: 1, token: "catch", messageIncludes: "names no owner at all" },
      why: "a reasonless empty catch proves only that the exception was erased. The `empty` half of the arm-precedence pin (see the `default.ts` row): same fixture shape, same token, DIFFERENT arm message",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/probe/continued.ts": "export function continued(): void {\n  try { risky(); } catch {}\n  reportSuccess();\n}\n" },
      expect: { count: 1, token: "catch" },
      why: "an arbitrary following statement does not own the erased failure",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/probe/looped.ts": "export function looped(): void {\n  for (;;) { try { risky(); } catch {} }\n}\n" },
      expect: { count: 1, token: "catch" },
      why: "loop continuation is control flow, not failure ownership",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/fake-state.ts":
          "export function fakeState(): void {\n  try { risky(); } catch (e) { sink = e; setStatus('ok'); }\n}\n",
      },
      expect: { count: 1, token: "e" },
      why: "an arbitrary assignment or success setter cannot launder caught-failure ownership",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/named-noop.ts":
          "const ignore = (): void => undefined;\nexport function namedNoop(): void {\n  void save().catch(ignore);\n}\n",
      },
      expect: { count: 1, token: "save" },
      why: "a named no-op handler is still an absorber, and unresolved names prove even less",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/fake-query.ts":
          "export function fakeQuery(arbitrary: A): void {\n  void arbitrary.refetch().catch(() => undefined);\n}\n",
      },
      expect: { count: 1, token: "arbitrary.refetch" },
      why: "a TanStack-like method name on an arbitrary receiver is not framework ownership",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/fake-hooks.ts":
          "export function fakeHooks(): void {\n  const fake = useFakeThing();\n  const mutation = useMutation();\n  void fake.refetch().catch(() => undefined);\n  void mutation.mutateAsync().catch(() => undefined);\n  void refetch().catch(() => undefined);\n  void withRequestSpan().catch(() => undefined);\n}\n",
      },
      expect: { count: 4 },
      why: "factory-like and framework-like spellings without their governed imports or owner configuration prove nothing",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/metric-only.ts":
          "export function metricOnly(): void {\n  void save().catch(() => { metrics.increment('ignored'); });\n}\n",
      },
      expect: { count: 1, token: "save" },
      why: "arbitrary observable work is not an error owner unless it surfaces, propagates, or records the failure context",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/discarded-recovery.ts":
          "const recover = (err: unknown): unknown => ({ status: 'failed', error: err });\nexport function discardedRecovery(): void {\n  void save().catch((err) => { return { status: 'failed', error: err }; });\n  void save().catch(recover);\n}\n",
      },
      expect: { count: 2 },
      why: "an error-as-data recovery value owns failure only when a caller consumes it; a discarded chain erases that value too",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/returned-absorbers.ts":
          "export function returned(): Promise<void> { return save().catch(() => undefined); }\nexport async function returnedAwait(): Promise<void> { return await save().catch(() => undefined); }\n",
      },
      expect: { count: 2, token: "save" },
      why: "returning or awaiting a promise whose handler converts rejection to undefined preserves completion but still erases the failure",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/discarded-containers.ts":
          "export function containers(): void {\n  void (save().catch(() => undefined), 0);\n  void [save().catch(() => undefined)];\n}\n",
      },
      expect: { count: 2, token: "save" },
      why: "sequence and array literals do not retain a nested recovered promise when the whole container is discarded",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/derived-discarded-containers.ts":
          "export function derivedContainers(flag: boolean): void {\n  void ({ result: save().catch(() => undefined) });\n  void (flag ? save().catch(() => undefined) : undefined);\n  void !save().catch(() => undefined);\n  void [save().catch(() => undefined)].length;\n}\n",
      },
      expect: { count: 4 },
      why: "wrapping a recovered promise in an unused object, conditional, unary, or derived property does not create a consumer for its failure value",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/discarded-recovered-containers.ts":
          "export function recoveredContainers(p: Promise<void>, flag: boolean): void {\n  void (p.catch((err) => ({ status: 'failed', error: err })) && flag);\n  void `failure: ${p.catch((err) => ({ status: 'failed', error: err }))}`;\n  void Promise.all([p.catch((err) => ({ status: 'failed', error: err }))]);\n}\n",
      },
      expect: { count: 3, token: "p" },
      why: "logical, template, and native Promise aggregate wrappers do not consume recovered failure data when their own value is discarded",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/repeated-position.ts":
          "export function oneMarker(): void {\n  // @orb-waive caught-failure-ownership(a.save): the first save is owned elsewhere; ends when it is awaited.\n  void [a.save().catch(() => undefined), b.save().catch(() => undefined)];\n}\n",
      },
      expect: { count: 1, token: "b.save" },
      why: "SUCCESSOR to the retired `promise:save_2` suffix (§4.6). Two absorbers share ONE marker carrier here, and the central engine's real predicate is POSITION identity, not statement identity — so anchoring on the WORK's whole callee chain (`a.save` / `b.save`) keeps them separately waivable with no synthetic ordinal. The marker consumes `a.save` and the sibling nobody reasoned about stays effective, which is exactly what the old suffix existed to guarantee",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/repeated-detached-position.ts":
          "export function coupledMarker(a: A, b: B): void {\n  // @swallowed-ok(cancel): the first stream is already closed. Ends if cancel becomes user-visible.\n  void a.cancel().catch(() => undefined); void b.cancel().catch(() => undefined);\n}\n",
      },
      expect: { count: 2 },
      why: "SUCCESSOR to the retired `@swallowed-ok` acceptance arm (§4.6), and the row that makes the behaviour change visible rather than silent: a WELL-FORMED, LIVE, exact-position detached-work marker suppresses NOTHING here now. `@swallowed-ok` belongs to `detached-work-traced` and keeps owning these sites there; this policy has exactly one door, the central `@orb-waive` marker. It replaces the four legacy rows that discriminated between foreign-path, wrong-position and malformed `@swallowed-ok` markers — none of which can still fire, so keeping them would have been a header claiming proof of a dead property",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/live-detached-bracket-owner.ts":
          "export function evict(): void {\n  // @swallowed-ok(evict): detached-work-traced owns this bracket-linked eviction; failure only costs RAM until exit. Ends if eviction gains a caller.\n  void cache.evict()['catch'](() => undefined);\n}\n",
      },
      expect: { count: 1, token: "cache.evict" },
      why: "the BRACKET-linked half of the same retired arm (§4.6): `cache.evict()['catch'](h)` was a mustPass under the legacy gate purely because detached-work-traced governed that exact site. The bracket spelling is still recognised as a rejection link — the finding is real — and the marker no longer owns it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/held-detached-marker.ts":
          "export function held(save: () => Promise<void>): Promise<void> {\n  // @swallowed-ok(save): this marker cannot own a held recovery because detached-work-traced governs statement dispatch only.\n  const recovered = save().catch(() => undefined);\n  return recovered;\n}\n",
      },
      expect: { count: 1, token: "save" },
      why: "a HELD recovery (`const recovered = save().catch(...)`) is still a site, and the anchor is the WORK (`save`) rather than the binding it lands in. The `@swallowed-ok` comment is inert here twice over — this policy retired that arm, and detached-work-traced governs statement dispatch only",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/success-laundering.ts":
          "export async function successLaundering(): Promise<void> {\n  try { await save(); } catch (err) { notify('saved'); }\n  try { await save(); } catch (err) { finish('ok'); }\n  try { await save(); } catch (err) { setError(null); }\n}\n",
      },
      expect: { count: 3 },
      why: "a success-valued notice, terminal, or cleared error slot cannot own the caught failure merely by callee name",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/notice-laundering.ts":
          "export async function noticeLaundering(): Promise<void> {\n  try { await save(); } catch (err) { notify.error('Saved successfully'); }\n  try { await save(); } catch (err) { notify.error('Different operation failed'); }\n  try { await save(); } catch (err) { notify.error('Saved successfully.', { cause: err }); }\n  try { await save(); } catch (err) {} finally { notify.error('Different operation failed'); }\n}\n",
      },
      expect: { count: 4 },
      why: "a notice that neither carries the caught binding nor belongs to a bindingless failure contract cannot own this failure",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/fake-notices.ts":
          "import { notify as importedNotify } from './noop.ts';\nconst notify = { error: (..._args: unknown[]): void => undefined };\nexport async function fakeNotices(): Promise<void> {\n  try { await save(); } catch (err) { notify.error(err); }\n  try { await save(); } catch (err) { importedNotify.error(err); }\n}\n",
      },
      expect: { count: 2 },
      why: "local or arbitrarily imported notice-shaped objects are not the governed user notification owner",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/success-object.ts":
          "export async function successObject(): Promise<unknown> {\n  try { return await save(); } catch (err) { return { status: 'ok', reason: 'done' }; }\n}\n",
      },
      expect: { count: 1, token: "err" },
      why: "a success outcome with a generic reason field does not encode the caught failure",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/success-with-error.ts":
          "import { useState } from 'react';\nexport async function successWithError(): Promise<unknown> {\n  const [, setError] = useState<unknown>();\n  try { return await save(); } catch (err) { return { status: 'ok', error: err }; }\n  try { await save(); } catch (err) { setError({ status: 'ok', error: err }); }\n}\n",
      },
      expect: { count: 2 },
      why: "an explicit success outcome remains success even when it carries the caught error as incidental data",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/empty-failure-fields.ts":
          "export async function emptyFailureFields(): Promise<unknown> {\n  try { return await save(); } catch (err) { return { error: null }; }\n  try { return await save(); } catch (err) { return { failed: false }; }\n  try { return await save(); } catch (err) { return { error: undefined, value: 'ok' }; }\n}\n",
      },
      expect: { count: 3 },
      why: "a failure-shaped property name does not preserve the caught failure when its value is null, undefined, or explicitly false",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/conditional-owners.ts":
          "export async function conditionalOwners(): Promise<void> {\n  try { await save(); } catch (err) { if (false) throw err; }\n  try { await save(); } catch (err) { if (false) notify.error(err); }\n  void save().catch((err) => { if (false) notify.error(err); });\n}\n",
      },
      expect: { count: 3 },
      why: "an unreachable or conditional owner does not dominate the absorb path; mixed control flow needs positioned proof",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/escaped-owners.ts":
          "export async function escapedOwners(skip: boolean): Promise<void> {\n  try { await save(); } catch (err) { if (skip) return; notify.error(err); }\n  void save().catch((err) => { if (skip) return; notify.error(err); });\n}\n",
      },
      expect: { count: 2 },
      why: "an earlier conditional escape leaves a swallow path that a later owner statement cannot dominate — THE row the discriminated-rethrow credit must not turn green: a BARE `return` swallows, so the trailing statement owns nothing",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/substituted-rethrow.ts":
          "export async function substitutedRethrow(): Promise<void> {\n  try { await save(); } catch (err) { if (isMissing(err)) { return; } throw new Error('refresh failed'); }\n}\n",
      },
      expect: { count: 1, token: "err" },
      why: "the BINDING-IDENTITY fence on the discriminated-rethrow credit: throwing a DIFFERENT value is loud but it destroys the caught failure's identity and cause chain, so it is not propagation of THIS failure",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/nested-throw.ts":
          "export async function nestedThrow(items: readonly string[]): Promise<void> {\n  try { await save(); } catch (err) { if (isMissing(err)) { return; } items.forEach(() => { throw err; }); }\n}\n",
      },
      expect: { count: 1, token: "err" },
      why: "a `throw` inside a NESTED FUNCTION does not escape the catch — it rejects some other call's promise, so the catch itself still completes normally and the failure is still absorbed",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/shadowed-owner.ts":
          "export async function shadowed(): Promise<void> {\n  try { await save(); } catch (err) { { const err = new Error('other'); notify.error(err); } }\n}\n",
      },
      expect: { count: 1, token: "err" },
      why: "an owner call for a shadow binding is not ownership of the caught failure",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/local-owner-names.ts":
          "const recordError = (_err: unknown): void => undefined;\nconst finish = (_value: unknown): void => undefined;\nexport async function localOwnerNames(): Promise<void> {\n  try { await save(); } catch (err) { recordError(err); }\n  void save().catch((err) => recordError(err));\n  try { await save(); } catch (err) { finish(err); }\n}\n",
      },
      expect: { count: 3 },
      why: "a local no-op cannot become an owner by choosing an error- or terminal-shaped name",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/fake-promise-reject.ts":
          "interface P { then: unknown; catch: (handler: (err: unknown) => unknown) => P }\nconst Promise = { reject: (_err: unknown): undefined => undefined };\nexport function fakeReject(p: P): void { void p.catch((err) => Promise.reject(err)); }\n",
      },
      expect: { count: 1 },
      why: "a local object named Promise cannot launder a discarded rejection through a fake reject method",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/returned-call-laundering.ts":
          "const ignore = (_err: unknown): undefined => undefined;\nconst success = (_err: unknown): unknown => ({ status: 'ok' });\nexport async function returnedCalls(): Promise<unknown> {\n  try { await save(); } catch (err) { return ignore(err); }\n  try { await save(); } catch (err) { return success(err); }\n}\n",
      },
      expect: { count: 2 },
      why: "passing the caught binding into a local call does not prove that the returned value carries failure ownership",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/local-sinks.ts":
          "export async function localSinks(): Promise<void> {\n  const trash: any = {};\n  const log = { warn: (..._args: unknown[]): void => undefined };\n  try { await save(); } catch (err) { trash.error = err; }\n  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n}\n",
      },
      expect: { count: 2 },
      why: "a discarded local property or fake log-shaped object is not an observable or governed failure owner",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/bare-local-sinks.ts":
          "let error: unknown; let failure: unknown;\nexport async function bareLocalSinks(): Promise<void> {\n  try { await save(); } catch (err) { error = err; }\n  try { await save(); } catch (err) { failure = err; }\n}\n",
      },
      expect: { count: 2 },
      why: "assigning a caught error to an unconsumed local binding is not an observable failure owner",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/shadowed-globals.ts":
          "export async function shadowedGlobals(process: P, globalThis: G): Promise<void> {\n  try { await save(); } catch (err) { process.stderr.write(err); }\n  try { await save(); } catch (err) { globalThis.reportError(err); }\n}\n",
      },
      expect: { count: 2 },
      why: "parameters named like ambient error sinks do not inherit the real process or globalThis ownership boundary",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/fake-imported-logger.ts":
          "import { log } from './noop.ts';\nexport async function fakeImportedLogger(): Promise<void> {\n  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n}\n",
      },
      expect: { count: 1 },
      why: "an arbitrary imported log-shaped object is not the repo's governed operator logger",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/fake-injected-owners.ts":
          "export async function fakeInjectedOwners(log: L, notify: N): Promise<void> {\n  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n  try { await save(); } catch (err) { notify.error(err); }\n}\n",
      },
      expect: { count: 2 },
      why: "an arbitrary parameter with a logger or notice-shaped method is not a governed failure surface",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/contextless-log.ts":
          "import type pino from 'pino';\nexport async function missingContext(log: pino.Logger): Promise<void> {\n  try { await save(); } catch (err) { log.warn({ err }, ''); }\n  try { await save(); } catch (err) { log.warn({ err }, undefined); }\n}\n",
      },
      expect: { count: 2 },
      why: "a structured log needs a non-empty operation message; bare error metadata has no operator context",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/shadowed-framework-imports.ts":
          "import { useQuery } from '@tanstack/react-query';\nimport { withRequestSpan } from '#foundation/observability';\nexport function shadows(useQuery: () => Q, withRequestSpan: () => Promise<void>): void {\n  const query = useQuery();\n  void query.refetch().catch(() => undefined);\n  void withRequestSpan().catch(() => undefined);\n}\n",
      },
      expect: { count: 2 },
      why: "a parameter shadowing a real import does not inherit that imported framework's ownership",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/reassigned-owners.ts":
          "import { useQuery } from '@tanstack/react-query';\nimport { createEntityMutation } from '#data';\nimport { logger } from '#foundation/observability';\nconst useOwned = createEntityMutation({ options, errorToast: 'Could not save.' });\nexport async function reassignedOwners(fakeQuery: Q, fakeMutation: M, fakeLog: L): Promise<void> {\n  let query = useQuery(options); query = fakeQuery;\n  let mutation = useOwned(); mutation = fakeMutation;\n  let log = logger; log = fakeLog;\n  void query.refetch().catch(() => undefined);\n  void mutation.mutateAsync(input).catch(() => undefined);\n  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n}\n",
      },
      expect: { count: 3 },
      why: "a governed initializer cannot own work after the binding is reassigned to an unproven implementation",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/reassigned-handler-owners.ts":
          "import { notify } from '#lib';\nimport { createEntityMutation } from '#data';\nlet own = (err: unknown): void => notify.error(err); own = () => undefined;\nlet logicalOwn = (err: unknown): void => notify.error(err); logicalOwn &&= () => undefined;\nlet propagate = (err: unknown): Promise<never> => Promise.reject(err); propagate = () => Promise.resolve(undefined as never);\nlet useOwned = createEntityMutation({ options, errorToast: 'Could not save.' }); useOwned = fakeHook;\nlet logicalUseOwned = createEntityMutation({ options, errorToast: 'Could not save.' }); logicalUseOwned &&= fakeHook;\nlet failureFactory = (err: unknown): unknown => ({ status: 'failed', error: err }); failureFactory = () => undefined;\nexport async function reassignedHandlerOwners(p: Promise<void>): Promise<unknown> {\n  void p.catch(own);\n  void p.catch(logicalOwn);\n  void p.catch(propagate);\n  void useOwned().mutateAsync(input).catch(() => undefined);\n  void logicalUseOwned().mutateAsync(input).catch(() => undefined);\n  try { await save(); } catch (err) { return failureFactory(err); }\n}\n",
      },
      expect: { count: 6 },
      why: "a named handler, propagation helper, mutation hook, or failure factory loses governed provenance after reassignment",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/hoisted-reassigned-handlers.ts":
          "import { notify } from '#lib';\nexport function hoistedReassignedHandlers(p: Promise<void>): unknown {\n  owned = () => undefined;\n  propagate = () => Promise.resolve(undefined as never);\n  failureFactory = () => ({ status: 'ok' });\n  for (loopOwned of [() => undefined]) {}\n  void p.catch(owned);\n  void p.catch(loopOwned);\n  void p.catch(propagate);\n  try { risky(); } catch (err) { return failureFactory(err); }\n}\nfunction owned(err: unknown): void { notify.error(err); }\nfunction loopOwned(err: unknown): void { notify.error(err); }\nfunction propagate(err: unknown): Promise<never> { return Promise.reject(err); }\nfunction failureFactory(err: unknown): unknown { return { status: 'failed', error: err }; }\n",
      },
      expect: { count: 4 },
      why: "hoisting and loop assignment do not preserve an owner's implementation after an earlier write replaces the function binding",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/partial-reject.ts":
          "const partial = (err: unknown): Promise<never> | undefined => { if (flag) return undefined; return Promise.reject(err); };\nexport function partialReject(p: Promise<void>): void {\n  void p.catch((err) => { if (flag) return undefined; return Promise.reject(err); });\n  void p.catch(partial);\n}\n",
      },
      expect: { count: 2 },
      why: "Promise.reject owns only the path that reaches it; an earlier recovered path still absorbs the rejection",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/partial-failure-factory.ts":
          "const maybeFailure = (err: unknown): { status: 'failed'; error: unknown } | undefined => { if (flag) return { status: 'failed', error: err }; };\nexport async function partialFailureFactory(): Promise<unknown> {\n  try { await save(); } catch (err) { return maybeFailure(err); }\n}\n",
      },
      expect: { count: 1, token: "err" },
      why: "a local failure factory with an implicit success-valued fallthrough does not preserve failure ownership on every path",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/false-never-owner.ts":
          "function looksTerminal(sealed: S): void { return undefined; }\nfunction alsoNotTerminal(sealed: S): string { throw new Error('sometimes'); }\nexport function decoys(box: B, sealed: S): void {\n  try { box.decrypt(sealed); } catch { return looksTerminal(sealed); }\n  try { box.decrypt(sealed); } catch { return alsoNotTerminal(sealed); }\n}\n",
      },
      expect: { count: 2 },
      why: "the OTHER direction of the never-returning owner: only a `never` RETURN TYPE proves the call cannot return. A void helper that merely looks terminal, and one that throws on SOME paths while its signature still returns a value, both leave a live swallow path",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/probe/fake-security-event.ts":
          "const securityEvent = (..._args: unknown[]): void => undefined;\nexport function fakeSecurityEvents(): string | null {\n  try { return parse(); } catch { securityEvent('jwks_rejected', { reason: 'parse' }); return null; }\n}\n",
      },
      expect: { count: 1, token: "catch" },
      why: "a LOCAL function named `securityEvent` is not the governed observability door — the owner is provenance, never the callee's name",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/probe/unnamed-security-event.ts":
          "import { securityEvent } from '#foundation/observability';\nexport function unnamedSecurityEvents(): string | null {\n  try { return parse(); } catch { securityEvent('', { reason: 'parse' }); return null; }\n  try { return parse(); } catch { securityEvent(dynamicName, { reason: 'parse' }); return null; }\n}\n",
      },
      expect: { count: 2 },
      why: "the governed door still needs a READABLE non-empty event name — an empty or dynamically-keyed event is not a greppable security trail, so it is not evidence",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/optional-owners.ts":
          "import { notify } from '#lib';\nexport async function optionalOwners(): Promise<void> {\n  try { await save(); } catch (err) { globalThis.reportError?.(err); }\n  try { await save(); } catch (err) { notify?.error(err); }\n}\n",
      },
      expect: { count: 2 },
      why: "an optional owner call can be skipped and therefore does not dominate the swallow path",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/fake-approved-exports.ts":
          "import { metrics as log } from '#foundation/observability';\nimport { metrics as notify } from '#lib';\nimport type pino from 'pino';\ntype Fake<T> = { warn: (context: unknown, message: string) => void };\nexport async function fakeApprovedExports(logParam: Fake<pino.Logger>): Promise<void> {\n  try { await save(); } catch (err) { log.warn({ err }, 'save failed'); }\n  try { await save(); } catch (err) { notify.error(err); }\n  try { await save(); } catch (err) { logParam.warn({ err }, 'save failed'); }\n}\n",
      },
      expect: { count: 3 },
      why: "an approved module or nested logger type does not govern arbitrary exports and wrapper parameters",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/fake-setter-slot.ts":
          "import { useState } from 'react';\nexport async function fakeSetterSlot(): Promise<void> {\n  const [setError] = useState<(value: unknown) => void>(() => undefined);\n  try { await save(); } catch (err) { setError(err); }\n}\n",
      },
      expect: { count: 1, token: "err" },
      why: "a function-valued React state value named like a setter is not the tuple's observable setter slot",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/erased-binding-references.ts":
          "import { notify } from '#lib';\nimport { useState } from 'react';\nexport async function erasedBindingReferences(state: S): Promise<unknown> {\n  const [, setError] = useState<unknown>();\n  try { await save(); } catch (err) { return err === undefined; }\n  try { await save(); } catch (err) { setError(err === undefined); }\n  try { await save(); } catch (err) { state.error = (void err, null); }\n  try { await save(); } catch (err) { notify.error('Saved.', { cause: err }); }\n}\n",
      },
      expect: { count: 4 },
      why: "incidental reference to a caught binding does not preserve the failure value, and success copy overrides metadata",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/dead-recovered-local.ts":
          "export function deadRecoveredLocal(): void {\n  const ignored = save().catch((err) => ({ status: 'failed', error: err }));\n}\n",
      },
      expect: { count: 1, token: "save" },
      why: "retaining recovered failure data in an unread local does not create a consumer or owner",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/vacuous-recovery-consumers.ts":
          "const ignore = (_value: unknown): void => undefined;\nexport function vacuousRecoveryConsumers(): void {\n  ignore(save().catch((err) => ({ status: 'failed', error: err })));\n  const recovered = save().catch((err) => ({ status: 'failed', error: err }));\n  void recovered;\n}\n",
      },
      expect: { count: 2 },
      why: "a local no-op argument or void read does not consume a recovered failure outcome",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/counterfeit-recovery-consumption.ts":
          "import { recordTurnOutcome } from '#foundation/observability';\nexport function counterfeitRecoveryConsumption(): unknown {\n  let overwritten = save().catch((err) => ({ status: 'failed', error: err }));\n  overwritten = Promise.resolve({ status: 'failed', error: new Error('other') });\n  const deadReturn = save().catch((err) => ({ status: 'failed', error: err }));\n  const readLater = (): unknown => deadReturn;\n  const deadRecord = save().catch((err) => ({ status: 'failed', error: err }));\n  const recordLater = (): void => recordTurnOutcome(deadRecord);\n  return overwritten;\n}\n",
      },
      expect: { count: 3 },
      why: "an overwritten value or reference trapped in an unconsumed closure does not consume the original recovered failure outcome",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/ephemeral-assignments.ts":
          "export async function ephemeralAssignments(): Promise<void> {\n  try { await save(); } catch (err) { ({} as { error?: unknown }).error = err; }\n  try { await save(); } catch (err) { makeScratch().error = err; }\n}\n",
      },
      expect: { count: 2 },
      why: "assigning a caught failure onto a temporary object that immediately dies is not observable state ownership",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/mixed-query-catch.ts":
          "import { useQuery } from '@tanstack/react-query';\nexport async function mixed(): Promise<void> {\n  const query = useQuery(options);\n  try { await risky(); await query.refetch(); } catch {}\n}\n",
      },
      expect: { count: 1, token: "catch" },
      why: "query state owns only its own refetch rejection, not an unrelated operation sharing the try block",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/invalid-mutation-toasts.ts":
          "import { createEntityMutation } from '#data';\nconst useEmpty = createEntityMutation({ options, errorToast: '' });\nconst useMissing = createEntityMutation({ options, errorToast: undefined });\nconst useSuccess = createEntityMutation({ options, errorToast: 'Saved successfully.' });\nexport function invalidToasts(): void {\n  void useEmpty().mutateAsync(input).catch(() => undefined);\n  void useMissing().mutateAsync(input).catch(() => undefined);\n  void useSuccess().mutateAsync(input).catch(() => undefined);\n}\n",
      },
      expect: { count: 3 },
      why: "an empty, undefined, or success-valued errorToast does not create a user-visible mutation owner",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/fake-hook-module.ts":
          "import { createEntityMutation } from '#data';\nconst fakeMutation = { mutateAsync: (_input: unknown): Promise<void> => Promise.resolve() };\nexport const useLookalike = (): typeof fakeMutation => fakeMutation;\nexport const useEmpty = createEntityMutation({ options, errorToast: '' });\nexport const useMissing = createEntityMutation({ options, errorToast: undefined });\nexport const useSuccess = createEntityMutation({ options, errorToast: 'Saved successfully.' });\nexport let useReassigned = createEntityMutation({ options, errorToast: \"Couldn't save.\" });\nuseReassigned = useLookalike;\n",
        "packages/client/src/features/probe/fake-factory-module.ts":
          'const createEntityMutation = (_config: unknown): (() => { mutateAsync: (input: unknown) => Promise<void> }) => () => ({ mutateAsync: () => Promise.resolve() });\nexport const useLocalFactory = createEntityMutation({ options, errorToast: "Couldn\'t save." });\n',
        "packages/client/src/features/probe/fake-imported-hooks.ts":
          "import { useEmpty, useLookalike, useMissing, useReassigned, useSuccess } from './fake-hook-module.ts';\nimport { useLocalFactory } from './fake-factory-module.ts';\nconst useCreateThing = (): { mutateAsync: (input: unknown) => Promise<void> } => ({ mutateAsync: () => Promise.resolve() });\nexport function fakeImportedHooks(): void {\n  void useCreateThing().mutateAsync(input).catch(() => undefined);\n  void useLookalike().mutateAsync(input).catch(() => undefined);\n  void useEmpty().mutateAsync(input).catch(() => undefined);\n  void useMissing().mutateAsync(input).catch(() => undefined);\n  void useSuccess().mutateAsync(input).catch(() => undefined);\n  void useReassigned().mutateAsync(input).catch(() => undefined);\n  void useLocalFactory().mutateAsync(input).catch(() => undefined);\n}\n",
      },
      expect: { count: 7 },
      why: "the module hop keeps every provenance check: a local or imported lookalike hook, an empty, undefined or success errorToast, an exported `let` the declaring module reassigns, and a local function named `createEntityMutation` own nothing on the importing side",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/function-toast-module.ts":
          "import { createEntityMutation } from '#data';\nfunction serverReason(fallback: string): (error: unknown) => string | null { return (error) => (error instanceof Error ? error.message : fallback); }\nexport const useFunctionToast = createEntityMutation({ options, errorToast: serverReason(\"Couldn't save.\") });\n",
        "packages/client/src/features/probe/function-toast.ts":
          "import { useFunctionToast } from './function-toast-module.ts';\nexport function functionToast(): void {\n  const mutation = useFunctionToast({ trpc, invalidation });\n  void mutation.mutateAsync(input).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, token: "mutation.mutateAsync" },
      why: "THE DECLARED LIMIT for a function-valued errorToast, in its honest direction: the factory's errorToast type allows a null return, which shows no toast, and proving the copy needs the helper body expanded, so the site stays a finding",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/indirect-mutation-owners-module.ts":
          "import { createEntityMutation } from '#data';\nexport const useSave = createEntityMutation({ options, errorToast: \"Couldn't save.\" });\nexport function useOpenThing(): (id: string) => Promise<void> {\n  const save = useSave({ trpc, invalidation });\n  return async (id) => { await save.mutateAsync({ id }); };\n}\n",
        "packages/client/src/features/probe/indirect-mutation-owners.ts":
          "import { useOpenThing, useSave } from './indirect-mutation-owners-module.ts';\nexport function indirectOwners(injected: { save: () => Promise<void> }): void {\n  const openThing = useOpenThing();\n  void openThing('a').catch(() => undefined);\n  void injected.save().catch(() => undefined);\n  const mutation = useSave({ trpc, invalidation });\n  const toggle = async (): Promise<void> => { await mutation.mutateAsync(input); };\n  void toggle().catch(() => undefined);\n}\nexport async function mixedTry(): Promise<void> {\n  const mutation = useSave({ trpc, invalidation });\n  try { await mutation.mutateAsync(input); selectSaved(); } catch { return; }\n}\n",
      },
      expect: { count: 4 },
      why: "THE DECLARED LIMIT for indirect mutation owners: a wrapper hook's returned function, an injected save, and a local function that awaits an owned mutation each hide the owner behind a call the reader does not expand, and a try block that does more than the governed operation absorbs that other work too",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/fooled-guarded-rethrow.ts":
          "export async function fooledGuards(skip: boolean): Promise<void> {\n  const outer = classify();\n  try { await save(); } catch (err) { if (skip) { throw err; } }\n  try { await save(); } catch (err) { if (isConflict(err)) { throw new Error('conflict'); } }\n  try { await save(); } catch (err) { let mapped = classify(err); mapped = null; if (mapped === null) { throw err; } }\n  try { await save(); } catch (err) { if (outer === null) { throw err; } }\n}\n",
      },
      expect: { count: 4, token: "err" },
      why: "the guarded-rethrow credit's fences: a guard that does not read the caught binding, a throw of a different value, a reassigned `let` classification, and a const declared outside the catch all leave a swallow path",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/fooled-typed-refusal.ts":
          "type Parse = { ok: true; value: unknown } | { ok: false; reason: string };\nfunction accept(): { ok: true; value: unknown } { return { ok: true, value: null }; }\nfunction either(flag: boolean): Parse { if (flag) { return { ok: false, reason: 'x' }; } return { ok: true, value: null }; }\nexport function fooledRefusals(text: string): Parse | null {\n  try { return { ok: true, value: JSON.parse(text) }; } catch { return accept(); }\n  try { return { ok: true, value: JSON.parse(text) }; } catch { return either(true); }\n  try { return { ok: true, value: JSON.parse(text) }; } catch (err) { if (err instanceof SyntaxError) { return { ok: false, reason: 'syntax' }; } return null; }\n  try { return { ok: true, value: JSON.parse(text) }; } catch (err) { if (err instanceof SyntaxError) { return { ok: false, reason: 'syntax' }; } }\n}\n",
      },
      expect: { count: 4 },
      why: "a typed refusal owns only when the type or a single-return factory proves the failure member: a success member, a union-typed call whose body has both arms, and a conditional refusal beside a null or fall-through path all leave the caller a success-shaped answer",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/boolean-typed-refusal.ts":
          "function denied(reason: string): { ok: false; reason: string } { const trimmed = reason.trim(); return { ok: false, reason: trimmed }; }\nexport function parse(text: string): unknown {\n  try { return JSON.parse(text); } catch { return denied('not-json'); }\n}\n",
      },
      expect: { count: 1, token: "catch" },
      why: "THE DECLARED LIMIT for a boolean discriminant read by type: the typed-refusal read takes `ok` through `literalValue`, which is undefined for a boolean literal type, so an `ok: false` member is provable only from an object literal or a single-return factory body, and a multi-statement helper typed `{ ok: false }` stays a finding",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/parameter-factories.ts":
          "function pass<T>(value: T): T { return value; }\nfunction wrap(value: unknown): { error: unknown } { return { error: value }; }\nexport function identity(text: string): unknown {\n  try { return JSON.parse(text); } catch { return pass([]); }\n}\nexport function clearedSlot(text: string): unknown {\n  try { return JSON.parse(text); } catch { return wrap(null); }\n}\n",
      },
      expect: { count: 2, token: "catch" },
      why: "a factory whose body is failure-valued only through its parameter owns nothing when the call passes something other than the caught binding: `pass([])` is a success value and `wrap(null)` is the cleared `{ error: null }` slot",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/toast-identity-module.ts":
          "import { createEntityMutation } from '#data';\nconst pass = <T,>(value: T): T => value;\nexport const useSave = createEntityMutation({ options, errorToast: pass('') });\n",
        "packages/client/src/features/probe/toast-identity.ts":
          "import { useSave } from './toast-identity-module.ts';\nexport function run(): void {\n  const mutation = useSave({ trpc, invalidation });\n  void mutation.mutateAsync(input).catch(() => undefined);\n}\n",
      },
      expect: { count: 1, token: "mutation.mutateAsync" },
      why: "an errorToast built by an identity helper from empty copy is not failure copy: the parameter path is not evidence when no caught binding reaches it",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/nonliteral-discriminants.ts":
          "type Optional = { status?: 'failed'; data?: string };\ntype NumberStatus = { status: 'error' } | { status: number; body: string };\ntype OpenKind = { kind: 'error' } | { kind: string & {}; body: string };\nfunction optional(flag: boolean): Optional { if (flag) { return { data: 'x' }; } return {}; }\nfunction numbered(flag: boolean): NumberStatus { if (flag) { return { status: 200, body: '' }; } return { status: 'error' }; }\nfunction open(flag: boolean): OpenKind { if (flag) { return { kind: 'fine', body: '' }; } return { kind: 'error' }; }\nexport function a(text: string): Optional {\n  try { return { data: JSON.parse(text) }; } catch { return optional(true); }\n}\nexport function b(text: string): NumberStatus {\n  try { return { status: 200, body: JSON.parse(text) }; } catch { return numbered(true); }\n}\nexport function c(text: string): OpenKind {\n  try { return { kind: 'fine', body: JSON.parse(text) }; } catch { return open(true); }\n}\n",
      },
      expect: { count: 3, token: "catch" },
      why: "a typed refusal needs EVERY member of its discriminant to be a failure literal: an optional key's `undefined`, a `number` status and an open `string` kind are success members, so none of these types proves a refusal",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/sole-new-module.ts":
          "import { createEntityMutation } from '#data';\nexport const useSave = createEntityMutation({ options, errorToast: \"Couldn't save.\" });\n",
        "packages/client/src/features/probe/sole-new.ts":
          "import { useSave } from './sole-new-module.ts';\nexport async function run(raw: string): Promise<unknown> {\n  const mutation = useSave({ trpc, invalidation });\n  try { await mutation.mutateAsync(new Payload(raw)); } catch { return []; }\n  return null;\n}\n",
      },
      expect: { count: 1, token: "catch" },
      why: "a constructor beside the governed operation is other work: `new Payload(raw)` can throw before the mutation runs, so the try is not a sole-operation owner",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/control.ts":
          "export function control(xs: unknown[]): void {\n  for (const x of xs) { try { risky(x); } catch { continue; } }\n  for (const x of xs) { try { risky(x); } catch { break; } }\n}\nexport function early(): void { try { risky(); } catch { return; } }\n",
      },
      expect: { count: 3, token: "catch" },
      why: "continue, break, and bare return erase the failure through control flow without naming an owner",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/probe/default.ts": "export function fallback(): null {\n  try { return parse(); } catch { return null; }\n}\n" },
      expect: { count: 1, token: "catch", messageIncludes: "constant fallback" },
      why: "an undocumented silent default changes behavior without proving who owns the failure contract. `messageIncludes` pins the ARM PRECEDENCE — `default` wins over `empty`, and a §4.1 cut proved that without it the precedence was unenforced: deleting `silentDefault` reclassifies this site as `empty` with an IDENTICAL token and count, so every count/token row survived the cut",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/opaque-rethrow-helper.ts":
          "import { rethrowLater } from './rethrow-later.ts';\n" +
          "export function opaque(): void {\n  try { risky(); } catch (err) { rethrowLater(err); }\n}\n",
        "packages/server/src/domain/probe/rethrow-later.ts":
          "export function rethrowLater(err: unknown): void {\n  if (shouldReport(err)) { record(err); }\n  throw err;\n}\n",
      },
      expect: { count: 1, token: "err" },
      why: "THE DECLARED LIMIT 'a rethrow or owner routed through an OPAQUE HELPER is invisible to a syntactic reader', in its honest direction — the limit is a KNOWN FALSE POSITIVE, so its proof is a mustFlag, not a mustPass. `rethrowLater` really does rethrow, but its body is a multi-statement block the single-expression factory reader cannot prove, so the catch still reds and the site owes a marker. The enforcement-catalogue row claimed a mustPass for this limit and there was none (§4.1)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/alias-handler.ts":
          "declare const logger: { error: (message: string, error: unknown) => void };\nfunction onErr(error: unknown): void {\n  const message = String(error);\n  logger.error(message, error);\n}\nconst handler = onErr;\nexport function run(p: Promise<void>): void {\n  void p.catch(handler);\n}\n",
      },
      expect: { count: 1, token: "p" },
      why: "D328 INSIDE THE BOUND: a multi-statement handler reached through a bare alias (`const handler = onErr`) sits in a handler position, so its body is walked and an ungoverned local logger is still a finding, never an unknown or a tool error",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/near-factory.ts":
          'declare function work(): void;\nfunction settle(): unknown { return { status: "ok" }; }\nexport function near(): unknown {\n  try { work(); } catch { return settle(); }\n}\n',
      },
      expect: { count: 1, token: "catch" },
      why: "D328 INSIDE THE BOUND: a catch whose fallback is a success outcome one factory hop away still blocks",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/imported-handlers-module.ts":
          "export function ignore(_error: unknown): void {}\nexport let surface = (error: unknown): never => {\n  throw error;\n};\n",
        "packages/client/src/features/probe/imported-handlers.ts":
          "import { ignore, surface } from './imported-handlers-module.ts';\nexport function run(p: Promise<void>): void {\n  void p.catch(ignore);\n  void p.catch(surface);\n}\n",
      },
      expect: { count: 2, token: "p" },
      why: "an imported handler is read through its alias, so an imported no-op still absorbs, and an exported `let` the declaring module may reassign proves no rethrow on the importing side",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/unretained-forks.ts":
          "export function early(work: () => Promise<void>, flag: boolean): Promise<void> {\n  const run = work();\n  void run.catch(() => undefined);\n  if (flag) {\n    return Promise.resolve();\n  }\n  return run;\n}\nexport function absorbedReturn(work: () => Promise<void>): Promise<void> {\n  const run = work();\n  void run.catch(() => undefined);\n  return run.then(() => undefined, () => undefined);\n}\nexport function reassignable(work: () => Promise<void>): Promise<void> {\n  let run = work();\n  void run.catch(() => undefined);\n  return run;\n}\nexport function other(work: () => Promise<void>): Promise<void> {\n  const run = work();\n  const next = work();\n  void run.catch(() => undefined);\n  return next;\n}\n",
      },
      expect: { count: 5, token: "run" },
      why: "a fork is retained only when the function's last statement returns the same `const` promise through handler-free links with nothing able to leave first: an earlier return, a returned chain that absorbs, a reassignable binding, or a different returned promise all leave the absorbed rejection with no caller",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/unreturned-deferreds.ts":
          "export function otherDeferred(run: () => Promise<void>): Promise<void> {\n  const a = Promise.withResolvers<void>();\n  const b = Promise.withResolvers<void>();\n  void run().then(a.resolve, a.reject);\n  return b.promise;\n}\nexport function kept(run: () => Promise<void>, keep: (p: Promise<void>) => void): void {\n  const a = Promise.withResolvers<void>();\n  void run().then(a.resolve, a.reject);\n  keep(a.promise);\n}\n",
        "packages/server/src/domain/probe/fake-deferred.ts":
          "const Promise = { withResolvers: () => ({ promise: undefined as unknown, resolve: (_value: unknown): void => undefined, reject: (_error: unknown): void => undefined }) };\nexport function fake(run: () => globalThis.Promise<void>): unknown {\n  const a = Promise.withResolvers();\n  void run().then(a.resolve, a.reject);\n  return a.promise;\n}\n",
      },
      expect: { count: 3, token: "run" },
      why: "forwarding into a deferred's `reject` propagates only when the function returns that same deferred's promise, and a local object named `Promise` is no native deferred",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/unowned-forwards.ts":
          "import type pino from 'pino';\nfunction reportOther(err: unknown, other: unknown, log: pino.Logger): void {\n  log.error({ err: other }, 'work failed');\n}\nlet reportLater = (err: unknown, log: pino.Logger): void => log.error({ err }, 'work failed');\nconst owned = (err: unknown, log: pino.Logger): void => log.error({ err }, 'work failed');\nfunction relay(err: unknown, log: pino.Logger): void {\n  owned(err, log);\n}\nexport function forwards(log: pino.Logger): void {\n  try { run(); } catch (err) { reportOther(err, null, log); }\n  try { run(); } catch (err) { reportLater(err, log); }\n  try { run(); } catch (err) { relay(err, log); }\n}\n",
      },
      expect: { count: 3, token: "err" },
      why: "a forward owns only through a one-statement helper whose body owns the very parameter the binding lands in: a helper that logs another value, a reassignable `let` helper, and a second forwarding hop are all past what the reader proves",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/unowned-issues.ts":
          "import { z } from 'zod';\nconst fake = { superRefine: (check: (value: string, ctx: { addIssue: (issue: unknown) => void }) => void): unknown => check };\nexport const local = fake.superRefine((value, ctx) => {\n  try { assertShape(value); } catch (error) { ctx.addIssue({ code: 'custom', message: String(error) }); }\n});\nexport const wrongSlot = z.string().superRefine((value, _ctx) => {\n  const sink = { addIssue: (_issue: unknown): void => undefined };\n  try { assertShape(value); } catch (error) { sink.addIssue({ code: 'custom', message: String(error) }); }\n});\n",
      },
      expect: { count: 2, token: "error" },
      why: "an issue owns only on the context parameter of a zod refinement callback: an `addIssue` on a lookalike schema or on any other object records nothing a parse reports",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/unowned-yields.ts":
          "function label(_error: unknown): string { return 'failed'; }\nexport function* delegated(work: () => unknown, other: () => Generator<unknown>): Generator<unknown, void> {\n  try { yield work(); } catch (error) { yield* other(); }\n}\nexport function* cleared(work: () => unknown): Generator<unknown, void> {\n  try { yield work(); } catch (error) { yield { thrown: null }; }\n}\nexport function relabelled(work: () => unknown): unknown {\n  try { return work(); } catch (error) { return { status: 'unresolved', reason: label(error) }; }\n}\n",
      },
      expect: { count: 3, token: "error" },
      why: "a delegated `yield*` hands over another generator's values, a `thrown: null` slot carries no failure, and a helper whose result ignores its parameter does not preserve the caught binding",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/native-reporter.ts":
          "export function surfaced(p: Promise<void>): void {\n  const report = globalThis.reportError;\n  void p.catch(globalThis.reportError);\n  void p.catch(globalThis['reportError']);\n  void p.catch(report);\n  void p.then(undefined, globalThis.reportError);\n  void p.catch((error) => globalThis.reportError(error));\n}\n",
      },
      why: "the native reportError function reports its argument as an exception whether invoked inline or passed directly, by static member spelling or an unchanged alias, as the rejection callback",
    },
    {
      mode: "types",
      files: {
        "tooling/src/probe/never-returning-cleanup.ts":
          "async function closeAfterFailure(primary: unknown): Promise<never> { throw primary; }\nexport async function ownedCleanup(): Promise<void> {\n  try { await save(); } catch (err) { return await closeAfterFailure(err); }\n}\n",
      },
      why: "a Promise<never> cleanup boundary preserves the primary failure and cannot recover the catch path",
    },
    {
      mode: "types",
      files: {
        "tooling/src/probe/unproven-outcome.ts":
          "export async function measured(): Promise<{ kind: 'absent' } | { kind: 'unproven'; reason: string }> {\n  try { await probe(); return { kind: 'absent' }; } catch (err) { return { kind: 'unproven', reason: String(err) }; }\n}\n",
      },
      why: "an explicit unproven result is failure-valued evidence that prevents the caller from treating a failed measurement as absence",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/never-returning-owner.ts":
          "function throwDecryptFailure(sealed: S): never { log.error({ code: 1 }, 'decrypt failed'); throw new Error('decrypt'); }\nexport function decryptSealed(box: B, sealed: S, aad: string): string {\n  try { return box.decrypt(sealed, aad); } catch { return throwDecryptFailure(sealed); }\n}\n",
      },
      why: "the live credentials decrypt seam: a SYNC `never`-returning helper cannot return, so control leaves by throwing — propagation, and it holds for a BINDINGLESS catch, which is exactly where a binding-gated reader used to demand a marker for the strongest ownership shape in the tree",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/auth/probe/security-event-owner.ts":
          "import { securityEvent } from '#foundation/observability';\nexport function jwksFor(raw: string): unknown {\n  try { return parseSet(raw); } catch { securityEvent('jwks_rejected', { reason: 'parse' }, 'security: rejecting'); return null; }\n}\n",
      },
      why: "the live JWKS/JWT reject seams: `securityEvent` is `getLog().warn({ security: true, event, … })` at the governed door, so the NAMED reason is the operator trail. It owns without the caught binding BY DESIGN — these seams must not leak the raw crypto error",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/storage/probe/discriminated-rethrow.ts":
          "function errnoIs(error: unknown, code: string): boolean { return typeof error === 'object' && error !== null && 'code' in error && error.code === code; }\nexport async function safeReaddir(dir: string): Promise<readonly string[]> {\n  try { return await readdir(dir); } catch (error) { if (errnoIs(error, 'ENOENT')) { return []; } throw error; }\n}\nexport async function elseArm(dir: string): Promise<readonly string[]> {\n  try { return await readdir(dir); } catch (error) { if (errnoIs(error, 'ENOENT')) { return []; } else { throw error; } }\n}\n",
      },
      why: "the live `cas.ts` shape, 81 sites at ruling time: ONE narrowly-guarded documented case and every other failure propagates UNCHANGED. Both the trailing-throw and else-branch spellings are the same control flow, and the credit is fenced on binding IDENTITY — see the substituted-value and nested-throw mustFlag rows for the two ways it must NOT fire",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/connection/probe/chained-cause.ts":
          "class CatalogUnavailableError extends Error {}\nexport async function refreshCatalog(): Promise<unknown> {\n  try { return await fetchCatalog(); } catch (err) {\n    const existing = await readSnapshot();\n    if (existing !== null) { return existing; }\n    throw new CatalogUnavailableError(err instanceof Error ? err.message : String(err), { cause: err });\n  }\n}\n",
      },
      why: "the two live catalog-refresh seams: a TYPED wrapper that chains `{ cause: err }` re-types the failure for the caller without destroying it, so the original stays reachable. Narrow by design — the substituted-value row proves a wrapper with NO cause still reds",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/failed-status.ts":
          "export async function failedStatus(): Promise<unknown> {\n  try { return await save(); } catch { return { status: 'failed', error: null }; }\n}\n",
      },
      why: "an explicit failed status owns the failure-valued result even when no exception object is retained",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/consumed-recovery.ts":
          "import { recordTurnOutcome } from '#foundation/observability';\nexport function consumedRecovery(p: Promise<void>): void {\n  recordTurnOutcome(p.catch((err) => ({ status: 'failed', error: err })));\n}\n",
      },
      why: "the governed observability sink consumes the recovered failure outcome as an error-as-data contract",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/propagated-reject.ts":
          "export function propagatedReject(p: Promise<void>): void {\n  void p.catch((err) => Promise.reject(err));\n  void p.catch((err) => { return Promise.reject(err); });\n}\n",
      },
      why: "native Promise.reject of the caught binding preserves rejection even when the outer chain is not retained",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/promise-reject.ts":
          "export async function reject(): Promise<never> { try { await save(); } catch (err) { return Promise.reject(err); } }\n",
      },
      why: "Promise.reject of the caught binding preserves rejection and therefore propagates ownership",
    },
    {
      mode: "types",
      files: {
        "packages/client/vite.config.ts": "export function configProbe(): void { try { save(); } catch {} }\n",
        "tests/support/probe.ts": "export function testProbe(): void { try { save(); } catch {} }\n",
        "scripts/dev/probe.ts": "export function scriptProbe(): void { try { save(); } catch {} }\n",
        "packages/showcase-plugins/src/probe.ts":
          "import { logger } from '#foundation/observability';\nexport function showcaseProbe(): void { try { save(); } catch (err) { logger.warn({ err }, 'showcase probe failed'); } }\n",
      },
      why: "THE POPULATION FENCE, all four declared limits in one row. The three EXCLUDED coordinates each carry a bare empty catch that would flag anywhere inside the population, and none does: a package BUILD/CONFIG file outside `<pkg>/src`, a `tests/` file (golden and cleanup behaviour), and a `scripts/` file (no runtime failure contract). The fourth file is the row's required IN-population anchor — `resolvePopulation` refuses an expression that admits zero paths, so a fence row proving only exclusions is a TOOL ERROR rather than a pass — and it doubles as the receipt for the `@showcase` root: `packages/showcase-plugins/src` IS governed, and the file is clean only because its catch owns the failure on the governed logger",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/framework-owned-catch.ts":
          "import { useQuery } from '@tanstack/react-query';\n" +
          "export async function frameworkOwnedCatch(): Promise<void> {\n" +
          "  const query = useQuery(options);\n" +
          "  try { await query.refetch(); } catch {}\n" +
          "}\n",
      },
      why: "THE CATCH ARM'S FRAMEWORK NARROWING, which §4.1 proved nothing enforced: deleting `hasFrameworkOwner` from `catchClauseSite` left EVERY pre-existing row green, because cutting a narrowing only ADDS findings at sites no row visits. A try block whose SOLE statement is a governed TanStack query operation has an owner already — the rejection lands in query state — so the empty catch beside it is not a site. Its twin is the `mixed-query-catch` mustFlag, where a second unrelated statement shares the try block and the narrowing correctly stops applying",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/dynamic-rejection-key.ts":
          "export function dynamicLink(p: Promise<void>, key: string): void {\n" +
          "  let mutableLink = 'catch';\n" +
          "  void p[key as keyof Promise<void>](() => undefined);\n" +
          "  void p[mutableLink as keyof Promise<void>](() => undefined);\n" +
          "}\n",
      },
      why: "THE DECLARED LIMIT 'a dynamically keyed rejection link is UNREADABLE, not assumed', which had NO ROW until the conversion audited the catalogue's five claimed limits against the module (§4.1). The bracket mustFlag row proves the NINE statically resolvable spellings flag, including a same-file `const link = 'catch' as const`; these are the other side. A parameter-valued key has no literal type to read, and a `let` is not a const so its initializer lends it nothing — in both cases the reader resolves no member name and does not recognise the call as a rejection link at all. It REFUSES rather than guessing `catch`, which is the whole point: a guessed link would flag a call that may never absorb anything.",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/probe/zod-catch.ts":
          "import { z } from 'zod';\n" +
          "const assigned = z.string().catch('fallback');\n" +
          "export const terminal = z.number().catch(0);\n" +
          "export const lazy = z.string().catch(() => 'fallback');\n" +
          "const base = z.string();\nexport const aliased = base.catch(() => 'fallback');\n",
      },
      why: "Zod catch combinators are non-Promise schema construction and remain outside caught-rejection ownership. The last TWO lines are the §4.1 repair: with only the value-handler spellings this row passed for the WRONG REASON — `isIgnoredPromiseHandler` short-circuits a bare literal handler, so deleting the zod fence from `promiseLikeValue` left the row green and the fence unproven. A FUNCTION handler reaches the fence, and an unresolved `zod` import types the receiver `any`, which `promiseLikeValue` otherwise admits as thenable. The alias line proves the fence follows a same-file const to its zod origin",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/propagated-handlers.ts":
          "export function propagatedHandlers(p: Promise<void>): void {\n  void p.catch(undefined);\n  void p.then(undefined, undefined);\n  void p.catch(null as any);\n  void p.catch(false as any);\n  void p.then(undefined, 0 as any);\n}\n",
      },
      why: "an undefined Promise handler is not a catch: Promise semantics propagate the rejection unchanged",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/mutation.ts":
          "import { createEntityMutation } from '#data';\nconst useSave = createEntityMutation({ options, busDriven: true, errorToast: \"Couldn't save.\" });\nexport function mutate(): void {\n  const mutation = useSave({ trpc, invalidation });\n  void mutation.mutateAsync(input).catch(() => undefined);\n}\n",
      },
      why: "the governed entity-mutation factory's required errorToast owns the rejection",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/hook-module.ts":
          "import { createEntityMutation } from '#data';\nexport const useCreateThing = createEntityMutation({ options, errorToast: \"Couldn't create the thing.\" });\n",
        "packages/client/src/features/probe/hook-barrel.ts": "export { useCreateThing } from './hook-module.ts';\n",
        "packages/client/src/features/probe/imported-mutation.ts":
          "import { useCreateThing } from './hook-barrel.ts';\nexport function importedMutation(): void {\n  const mutation = useCreateThing({ trpc, invalidation });\n  void mutation.mutateAsync(input).catch(() => undefined);\n  void mutation.mutateAsync(input).then(() => undefined, () => undefined);\n}\nexport async function importedMutationCatch(): Promise<void> {\n  const mutation = useCreateThing({ trpc, invalidation });\n  try { await mutation.mutateAsync(input); } catch { return; }\n  try { await mutation.mutateAsync(input); } catch {}\n}\n",
      },
      why: "an entity-mutation hook IMPORTED from another module, through a re-export, keeps the errorToast owner: the binding resolves to one unreassignable `const` initialized by the governed factory with failure copy. A try block whose sole statement is that operation owns the early return too, because the toast already surfaced the failure",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/guarded-rethrow.ts":
          "export async function guardedRethrow(): Promise<void> {\n  try { await save(); } catch (err) { if (!(err instanceof ConflictError)) { throw err; } markConflict(); }\n  try { await save(); } catch (err) { if ((err as { code?: string }).code !== 'ENOENT') throw err; }\n  try { await save(); } catch (err) { const mapped = classify(err); if (mapped === null) { throw err; } emit(mapped); }\n  try { await save(); } catch (err) { if (isConflict(err)) { markConflict(); } else { throw err; } }\n  try { await save(); } catch (err) { if (!isConflict(err)) { record(err); throw new SaveError('save failed', { cause: err }); } markConflict(); }\n}\n",
      },
      why: "THE GUARDED RETHROW, the mirror of the discriminated rethrow: a guard that classifies the caught binding (directly, or through a const derived from it inside the catch) sends every other failure out by rethrowing it or chaining it as `cause`, so only the classified case is absorbed",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/typed-refusal.ts":
          "type Parse = { ok: true; value: unknown } | { ok: false; reason: string } | { kind: 'refused'; reason: string };\nfunction refuse(reason: string): Parse { return { ok: false, reason }; }\nfunction denied(reason: string): { kind: 'refused'; reason: string } { const trimmed = reason.trim(); return { kind: 'refused', reason: trimmed }; }\nexport function parse(text: string): Parse {\n  try { return { ok: true, value: JSON.parse(text) }; } catch { return refuse('not-json'); }\n}\nexport function parseDenied(text: string): Parse {\n  try { return { ok: true, value: JSON.parse(text) }; } catch (err) { return denied('not-json'); }\n}\nexport async function issue(): Promise<{ ok: true } | { ok: false; code: string }> {\n  try { await order(); return { ok: true }; } catch (err) { if (err instanceof AbortError) { return { ok: false, code: 'aborted' }; } return { ok: false, code: 'issuance_failed' }; }\n}\nexport function parseLater(text: string): Promise<Parse> {\n  return parseAsync(text).catch(() => refuse('not-json'));\n}\n",
      },
      why: "THE TYPED REFUSAL: a call whose declared type admits only the failure member, or a single-return factory whose body is that member, owns the failure even when it does not carry the caught binding; and a conditional refusal is not an escape when every path returns a refusal",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/guard-narrowness.ts":
          "export async function narrowness(): Promise<void> {\n  try { await save(); } catch (err) { if (err instanceof TypeError) { throw err; } }\n  try { await save(); } catch (err) { if (err === err && false) { throw err; } }\n}\n",
      },
      why: "THE DECLARED LIMIT for guard narrowness, credited BY DESIGN: the guard reads the caught binding, so a guard that rethrows only a `TypeError`, or one that can never be true, still earns the guarded-rethrow credit. The reader proves the guard classifies the failure, not that the absorbed case is narrow",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/query.ts":
          "import { useQuery } from '@tanstack/react-query';\nexport function query(): void {\n  const query = useQuery(options);\n  void query.refetch().catch(() => undefined);\n}\n",
      },
      why: "TanStack query operations retain their failure in query state",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/form.ts":
          "import { useForm } from '@tanstack/react-form';\nexport function form(): void {\n  const form = useForm(options);\n  void form.handleSubmit().catch(() => undefined);\n}\n",
      },
      why: "the TanStack form submission state owns the rejection",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/form-error.ts":
          "import { useState } from 'react';\nexport async function formError(): Promise<void> {\n  const [, setError] = useState<string | null>(null);\n  try { await save(); } catch (err) { setError(err instanceof Error ? err.message : 'Save failed.'); }\n}\n",
      },
      why: "a genuine React setter owns a failure-valued message on every conditional arm",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/auth/parser.ts":
          "export function allowed(raw: string): boolean {\n  // @orb-waive caught-failure-ownership(err): fail-closed auth parser owns false as denial. Ends if callers distinguish malformed input.\n  try { return parse(raw); } catch (err) { return false; }\n}\n",
      },
      why: "THE POSITIVE IDENTITY ARM (§4.2) for the DEFAULT arm: the fixture produces exactly one finding, and the correct `@orb-waive` at the reported position — the caught BINDING `err` — suppresses it (0 effective, 1 waived, 0 alarms). Its twin is the `substituted-rethrow` mustFlag row, which reports the same `err` position. This is also the irreducible fail-closed auth/parser contract naming its owner",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/logged.ts":
          "import type pino from 'pino';\nexport function logged(log: pino.Logger): void {\n  try { run(); } catch (err) { log.warn({ err, job: 'sync' }, 'sync failed'); }\n}\n",
      },
      why: "a structured contextual operator log is machine-visible ownership",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/finally-owned.ts":
          "import { notify } from '#lib';\n" +
          "export function finallyOwned(): void {\n" +
          '  try { risky(); } catch {} finally { notify.error("Couldn\'t sync."); }\n' +
          "}\n",
      },
      why: "THE CATCH ARM'S FINALLY NARROWING, and the row that dies without it: `ARM_MESSAGE.empty` claims the site names no owner `(and its finally)`, so the finally clause of `unownedCatch` is a claim this module's own message makes (§5b.2). §4.1 proved nothing enforced it — replacing the finally-owner pair with `return true` left all 1,659 corpus rows green, because cutting a narrowing only ADDS findings at sites no row visits. A bindingless catch whose FINALLY carries the governed user-visible surface with failure-valued copy has an owner, so it is not a site. Its twin is the `notice-laundering` mustFlag, whose fourth line is the NEGATIVE direction: a finally whose notice owns nothing still flags",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/infra/probe/cleanup.ts":
          "export function cleanup(stream: S): void {\n  // @orb-waive caught-failure-ownership(stream.cancel): teardown has no user result; failure only leaves an already-closing stream for process exit. Ends if teardown becomes retryable.\n  void stream.cancel().catch(() => undefined);\n}\n",
      },
      why: "THE POSITIVE IDENTITY ARM (§4.2) for the PROMISE arm, and the row that pins the member-chain anchor: the position is the WORK's whole callee text `stream.cancel`, NOT the legacy `promise:cancel` label and not the bare link name. One finding, suppressed. A cleanup/teardown absorber is the shape that legitimately uses it",
    },
    {
      mode: "types",
      files: {
        "tooling/src/probe/nested-cleanup.ts":
          "export async function capture(run: () => Promise<void>, close: () => Promise<void>, settled: Promise<void>): Promise<void> {\n" +
          "  let primary: unknown = null;\n  const cleanup: unknown[] = [];\n" +
          "  // @orb-waive caught-failure-ownership(error): the primary failure is retained and combine always rethrows it after cleanup. Ends if combine stops throwing it.\n" +
          "  try {\n    await run();\n  } catch (error) {\n    primary = error;\n  } finally {\n" +
          "    // @orb-waive caught-failure-ownership(closeError): close failure is retained in cleanup and combined. Ends if cleanup stops reaching combine.\n" +
          "    try {\n      await close();\n    } catch (closeError) {\n      cleanup.push(closeError);\n    }\n" +
          "    // @orb-waive caught-failure-ownership(settleError): settle failure is retained in cleanup and combined. Ends if cleanup stops reaching combine.\n" +
          "    try {\n      await settled;\n    } catch (settleError) {\n      cleanup.push(settleError);\n    }\n" +
          "  }\n  combine(primary, cleanup);\n}\n",
      },
      why: "THE NESTED-CLEANUP IDENTITY SHAPE (heap-capture.ts): a primary catch whose finally holds two cleanup catches, three markers, every one consumed (0 effective, 3 waived, 0 alarms). The outer marker's carrier is the whole outer try statement, which CONTAINS the nested catches, so the row only holds because each nested catch binds a DISTINCT name — renaming `closeError`/`settleError` back to `error` turns the outer marker over-broad and reds this row on the alarm. That is the reader-header claim (one binding name per carrier) corrected and pinned",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/engine.ts":
          "export function engine(): void {\n  // @orb-waive caught-failure-ownership(runOuter): the engine records the terminal before this caller boundary. Ends if runOuter stops owning terminal state.\n  void runOuter().catch(() => undefined);\n}\n",
      },
      why: "the BARE-CALLEE half of the promise anchor: `runOuter().catch(h)` reports `runOuter`, with no receiver chain in front of it. A deliberate outer-engine absorber names the terminal owner instead of relying on syntax",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/surfaced.ts":
          "import { notify } from '#lib';\nexport function surfaced(): void {\n  void save().catch((err) => notify.error(err));\n}\n",
      },
      why: "a direct user-visible error surface owns the rejection",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/surfaced-copy.ts":
          "import { notify } from '#lib';\nexport function surfacedCopy(): void {\n  void save().catch((err) => notify.error(\"Couldn't save.\", { cause: err }));\n}\n",
      },
      why: "failure-valued copy plus caught-error metadata is a contextual user-visible owner",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/propagated.ts":
          "export async function propagated(): Promise<void> {\n  try { await save(); } catch (err) { throw err; }\n}\n",
      },
      why: "rethrowing preserves caller ownership",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/named.ts":
          "import { notify } from '#lib';\nfunction reportSaveFailure(err: unknown): void { notify.error(err); }\nexport function named(): void {\n  void save().catch(reportSaveFailure);\n}\n",
      },
      why: "a named rejection handler is a machine-visible owner boundary",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/alias-report.ts":
          "declare function note(message: string): void;\nfunction onErr(error: unknown): void {\n  const message = String(error);\n  globalThis.reportError(error);\n  note(message);\n}\nconst handler = onErr;\nexport function run(p: Promise<void>): void {\n  void p.catch(handler);\n}\n",
      },
      why: "D328 INSIDE THE BOUND: the same aliased multi-statement handler hands the failure to `reportError`, and the walked body owns it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/rethrow-module.ts": "export function surface(error: unknown): never {\n  throw error;\n}\n",
        "packages/client/src/features/probe/rethrow-barrel.ts": "export { surface } from './rethrow-module.ts';\n",
        "packages/client/src/features/probe/imported-rethrow.ts":
          "import { surface } from './rethrow-barrel.ts';\nexport function run(p: Promise<void>): void {\n  void p.catch(surface);\n}\n",
      },
      why: "a rethrowing handler imported through a re-export is read at its declaration: the rejection leaves the detached chain unhandled, the same as an inline `(error) => { throw error; }`",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/retained-forks.ts":
          "export function lane(prior: Promise<void>, job: () => Promise<void>, keep: (p: Promise<void>) => void): Promise<void> {\n  const run = prior.then(job);\n  const tail = run.catch(() => undefined);\n  keep(tail);\n  return run.finally(() => undefined);\n}\nexport function track(run: () => Promise<void>): Promise<void> {\n  const operation = Promise.withResolvers<void>();\n  void run().then(operation.resolve, operation.reject);\n  void operation.promise.then(\n    () => undefined,\n    () => undefined,\n  );\n  return operation.promise;\n}\n",
      },
      why: "a RETAINED rejection: a bookkeeping handler on a promise the function returns as its last statement, or a rejection forwarded into a native deferred whose promise it returns, still reaches the caller",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/forwarded-owner.ts":
          "import type pino from 'pino';\nfunction report(log: pino.Logger, err: unknown): void {\n  log.error({ err }, 'detached work failed');\n}\nexport function forwarded(log: pino.Logger, p: Promise<void>): void {\n  void p.then(\n    () => undefined,\n    (err: unknown) => report(log, err),\n  );\n  try { run(); } catch (err) { report(log, err); }\n}\n",
      },
      why: "a FORWARDED owner: the caught binding handed to a one-statement helper whose body owns that parameter is owned by the helper's own owner",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/probe/zod-issue.ts":
          "import { z } from 'zod';\nexport const checked = z.string().superRefine((value, ctx) => {\n  try { assertShape(value); } catch (error) { ctx.addIssue({ code: 'custom', message: String(error) }); }\n});\nexport const decoded = z.string().transform((value, ctx) => {\n  try { return decode(value); } catch { ctx.addIssue({ code: 'custom', message: 'Invalid value' }); return z.NEVER; }\n});\n",
      },
      why: "a zod refinement ISSUE: any issue on a `superRefine` or `transform` context fails the parse, so the caller receives the failure as its ZodError",
    },
    {
      mode: "types",
      files: {
        "tooling/src/probe/yielded-refusals.ts":
          "function messageOf(error: unknown): string { return error instanceof Error ? error.message : String(error); }\nexport function* runs(work: () => unknown): Generator<unknown, void> {\n  try { yield { result: work() }; } catch (error) { yield { thrown: messageOf(error) }; }\n}\nexport function resolve(work: () => unknown): unknown {\n  try { return work(); } catch (error) { return { status: 'unresolved', reason: messageOf(error) }; }\n}\n",
      },
      why: "a generator's plain `yield` delivers its value to the iterating caller as a `return` does, `thrown` names a failure, and a one-expression helper that preserves its parameter preserves the caught binding",
    },
    ...HANDLER_SPELLINGS.map((statement) => ({
      mode: "types" as const,
      files: REPORTING_HANDLER(statement),
      why: `D328 HANDLER SPELLING: \`${statement}\` hands over the same multi-statement handler the rejection reader unwraps, so its body is walked and owns the failure, never an unknown (tests/tooling/verify/gates/caught-failure-bound.test.ts asserts no unknown)`,
    })),
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/far-never.ts":
          "declare function work(): void;\ndeclare function halt(): never;\nfunction hop3(): unknown { return halt(); }\nfunction hop2(): unknown { return hop3(); }\nfunction hop1(): unknown { return hop2(); }\nexport function past(): unknown {\n  try { work(); } catch { return hop1(); }\n}\n",
      },
      why: "D328 PAST THE BOUND: the `never` that owns this catch is three factory hops away, so the verdict is an advisory unknown — no finding, and never reported as owned (tests/tooling/verify/gates/caught-failure-bound.test.ts asserts the unknown)",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/probe/global-alias.ts": "declare const pending: Promise<void>;\nconst recover = pending.catch.bind(pending);\n",
        "packages/client/src/features/probe/global-use.ts": "export function run(): void {\n  void recover(() => undefined);\n}\n",
      },
      why: "D328 PAST THE BOUND: a bound rejection alias declared in another (global script) file is reached by no root, so its call is an advisory unknown, never a tool error and never clean (tests/tooling/verify/gates/caught-failure-bound.test.ts asserts the unknown)",
    },
  ],
});
