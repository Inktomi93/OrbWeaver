// Policy: caught-failure-ownership — a SYNTACTICALLY handled rejection is not ownership. Reports UNPROVEN
// OWNERSHIP (never "bug") for three arms over every authored runtime source file: a discarded promise
// rejection handler, a catch with no owning continuation, and a silent DEFAULT return. The policy rewards
// RUNTIME ownership, not syntax cosplay — every owner is provenance-checked.
//
// ── FAMILY ──────────────────────────────────────────────────────────────────────────────────────────────
// `caught-failure-ownership`, on the shared reader `lib/caught-failure.ts`
// (`catchClauseSite` / `promiseAbsorberSite` / `caughtFailureReviewSites`). That extraction IS the census
// blocker this conversion answers (uncovered-gate-conversion-census.md:182 — "must split reusable failure
// facts"): the reader's consumers are this policy, `ops/gen/caught-failure-population.ts`, which derives the
// durable review record at tooling/src/verify/gates/caught-failure-ownership.population.json, and the hard
// sibling `caught-failure-ownership-health`, which joins that record to the tree on `siteId`. One producer,
// so the artifact and the policies can never disagree about what a site is. The sibling exists because a
// two-sided join over the whole corpus is `entire-population` and `hard` — neither of which this per-file,
// waivable policy is (§12.1 splits a module on authority).
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
// The legacy gate accepted a live exact-position `@swallowed-ok` marker owned by `detached-work-traced` as
// ownership evidence, through `hasLiveDetachedSwallowOwner`. That arm is disqualified four ways over: it is
// a cross-GATE import, it walks `Project#getSourceFiles` (detached-work-traced.ts:497), it reads
// module-scope pass state, and it is a PRIVATE MARKER PARSER for ANOTHER gate's custom grammar — which
// §12.5 bans outright ("no gate-specific exemption grammar"). `detached-work-traced` is also still LEGACY,
// so §7 forbids touching those sites' grammar at all. The arm is GONE. Every `@swallowed-ok` marker stays
// exactly where it is and keeps its own owner; the five sites it covered now carry an `@orb-waive` marker
// of this policy's own, with the `@swallowed-ok` reason carried verbatim. Two markers, each stale-checked
// by the engine that owns it.
//
// ── WHAT PASSES, AND WHY IT IS ALL PROVENANCE ───────────────────────────────────────────────────────────
// The ownership vocabulary is the reader's header — it is the reader's law, not this module's. In one line:
// propagation (rethrow, discriminated rethrow, `{ cause }` chaining, a `never`/`Promise<never>` call, a
// native `Promise.reject` of the binding), the governed operator surfaces (pino/`getLog` structured log,
// `securityEvent`, `withRequestSpan`, `notify`/toast with non-success copy), observable state (a genuine
// React setter slot, TanStack query/form, `createEntityMutation`'s `errorToast`), and an error-as-data
// outcome a real consumer reads. Every one is provenance-checked; a success discriminator REFUSES.
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
// ── DECLARED LIMITS (each with a mustPass row) ──────────────────────────────────────────────────────────
// Five, and the conversion AUDITED each against the module rather than carrying the claim (§4.1 — two of the
// five had no row at all, which is the defect this program keeps finding):
//   · a dynamically-keyed rejection link is unreadable, not assumed — `dynamic-rejection-key` mustPass, ADDED
//     here; the bracket mustFlag row only ever proved the nine STATICALLY resolvable spellings.
//   · zod's `.catch()` combinator is schema construction, not a promise — `zod-catch` mustPass.
//   · package build/config files outside `packages/<name>/src`, and `tests/` + `scripts/` — the population-fence
//     mustPass, which carries all three excluded coordinates plus its required in-population anchor.
//   · a rethrow or owner routed through an OPAQUE HELPER is invisible to a syntactic reader — this one is a
//     KNOWN FALSE POSITIVE, so its honest proof is the `opaque-rethrow-helper` mustFLAG, ADDED here. The
//     catalogue claimed a mustPass for it; a mustPass would have been a lie about which way the limit cuts.
//
// The legacy `caught-failure-ownership` descriptor (5f4d2703d15b930afbadbeb7fb8d77a6178c85a4) carried
// the `@orb-gate-ignore` grammar named above and its own inline three-arm reader before this conversion
// extracted `lib/caught-failure.ts`.
//
// RE-SPELLED 2026-09-20 (lane cb-population-truth, #2488) from explicit package roots to `@product` plus
// the then-excluded content packages. The 2026-09-21 owner decision classifies both shipped content
// packages into `@product`, making those explicit refs redundant while keeping the intended corpus. The
// expression now lives in `lib/caught-failure.ts#CAUGHT_FAILURE_POPULATION` (work item 0009), because the
// census and its health sibling must walk this exact corpus too.
import { SyntaxKind } from "ts-morph";
import type { CaughtFailureArm } from "../contract/caught-failure.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { CaughtFailureSite } from "../lib/caught-failure.ts";
import { CAUGHT_FAILURE_POPULATION, catchClauseSite, promiseAbsorberSite } from "../lib/caught-failure.ts";

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
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.CatchClause],
        visit: (node) => {
          reportSite(ctx, catchClauseSite(node.asKindOrThrow(SyntaxKind.CatchClause)));
        },
      },
      {
        kinds: [SyntaxKind.CallExpression],
        visit: (node) => {
          reportSite(ctx, promiseAbsorberSite(node.asKindOrThrow(SyntaxKind.CallExpression)));
        },
      },
    ],
  }),
  mustFlag: [
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
  ],
  mustPass: [
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
  ],
});
