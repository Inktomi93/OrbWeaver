---
kind: review
status: active
updated: 2026-08-25
---

# Gate-hardening final review

Reviewed `5ae85a33e..59fed45ee` against the 2026-08-25 tooling-review repair intent: make gates non-vacuous and fail-loud, migrate CT one-shot findings honestly, preserve the two refuted current-head claims, and reconcile the Active-Gates registry with D139. The verdict is **15 confirmed findings, severity ceiling P1**. The supplied authoritative static receipt was 16/16 PASS; that full suite was intentionally not rerun. Every finding below was reproduced against target commit `59fed45ee384ded3ed5319888fae7447db1e0282`.

## Confirmed findings

### P1 — `tooling/src/verify/gates/chat-viewer-plane-canon-reads.ts:223` — the clamp proof accepts the forbidden predicate polarity and does not bind the predicate to the callback event

The gate proves only that the reader receiver is filtered and that some nested call has the tail name `isBelowHistoryFloor`. It neither requires exclusion/negation nor proves that the filter callback's element is the value being checked. A member reader can therefore retain exactly the pre-join rows D16/D79 require it to exclude:

```ts
return async () =>
  (await loadChatEventReplay()).filter((event) =>
    isBelowHistoryFloor(event, 1)
  );
```

Evidence: the `chat-inverted-clamp` planted row in `pnpm tsx reports/stickler/scratch/final-gate-probes.ts` returned `expected a finding but got 0`, with `replayChatEvents: "member"` and the banned reader configured. Inputs/state: the replay contains below-floor events and a member reader uses the positive predicate as its filter. Wrong outcome: below-floor/pre-join events survive while the gate reports clean. D16 and D79 make viewer-plane history exclusion a confidentiality boundary; the gate must bind the predicate argument to the callback element and prove exclusion semantics.

### P1 — `tooling/src/verify/gates/owner-scoped-reads.ts:79` — a post-fetch comparison is accepted without proving it compares ownership to the acting principal or rejects the row

The checker looks for an `ownerId` member anywhere in an `if` condition and an exit-like statement in the branch. It does not bind the other operand to the caller's canonical principal, and does not establish that the branch rejects a mismatch. This tautology passes:

```ts
const rows = await db.select().from(characters)
  .where(eq(characters.id, id)).limit(1);
if (rows[0]?.ownerId !== rows[0]?.ownerId) return null;
return rows[0];
```

Evidence: the `owner-self-comparison` planted row in `pnpm tsx reports/stickler/scratch/final-gate-probes.ts` returned `expected a finding but got 0`. Inputs/state: an attacker requests another owner's row by ID. Wrong outcome: the false self-comparison never rejects and the cross-tenant row is returned, while the gate reports clean. This is an authorization-boundary defect; remediation must symbol-bind the owner comparison to the route's authenticated principal and prove mismatch rejection before the success return.

### P1 — `tooling/src/verify/lib/bus-coverage.ts:50` — producer coverage credits any same-named method call, even when the receiver is unrelated to the bus

`collectProducerCallSites` identifies operations by the property tail alone, so `logger.emit` is counted as a bus producer. Minimal planted source:

```ts
const belt = { emitted: "emitted" };
export function produce(logger: Logger) {
  logger.emit({ type: "emitted" });
}
```

Evidence: the `bus-wrong-receiver` planted row in `pnpm tsx reports/stickler/scratch/final-gate-probes.ts` returned `expected a finding but got 0`. An `ast-grep run -p '$A.reconcileBusCoverage($B)' -l ts tooling/src --inspect summary` sweep scanned 560 TypeScript files and found all five live wrappers—automation, bus/chat, domain-events, RPG, and user—share this helper. Inputs/state: a belt event exists but no actual bus producer emits it; an unrelated object exposes `emit`. Wrong outcome: the event is credited as produced across any of those five coverage gates, so a dead integration path appears covered. Receiver/import/symbol identity must be part of the producer proof.

### P1 — `tooling/src/verify/gates/query-freshness-coverage.ts:323` — declaration reachability follows identifier text in property keys, allowing a dead helper to appear live

The reachability walk collects every identifier in a declaration and treats matching declaration names as edges. An object key therefore creates a fake call/reference edge:

```ts
function deadHelper(trpc: AppTrpc) {
  return [trpc.ghost.frozenRead.pathFilter()];
}
export function createInvalidation(_trpc: AppTrpc) {
  return { deadHelper: false };
}

// elsewhere
trpc.ghost.frozenRead.queryOptions({});
```

Evidence: the `query-dead-helper-property-name` planted row in `pnpm tsx reports/stickler/scratch/final-gate-probes.ts` returned `expected a finding but got 0`. Inputs/state: a query is configured with infinite freshness and its only invalidation reference is in an unreachable helper; the root function merely returns an object whose key has the helper's name. Wrong outcome: the gate marks the invalidation path reachable and permits a permanently frozen query. Reachability must follow symbol-resolved calls/references rather than arbitrary identifier text.

### P1 — `tooling/src/verify/gates/evaluate-no-scope-capture.ts:152` — an imported `evaluate` callback is silently exempt when its declaration lives in another source file

`resolveCallback` returns no callback for a declaration whose `SourceFile` differs from the call site's, and the visitor then skips the call without a finding or tool error. Minimal two-file case:

```ts
// constants.ts
const MARK = "data-mark";
export function paint(el: Element) {
  el.setAttribute(MARK, "1");
}

// probe.ts
import { paint } from "./constants";
await locator.evaluate(paint);
```

Evidence: both the `evaluate-imported-capture` planted gate row and a direct `evaluate()` run against a resolved two-file project returned zero findings; the direct result was `{"findings":[],"toolErrors":[]}`. Inputs/state: Playwright serializes `paint` into the browser where module-scope `MARK` does not exist. Wrong outcome: the call fails at runtime with an unresolved closure value, while the gate reports clean. An imported callback must either be resolved and analyzed across its source file or fail loud as unsupported. The repaired inline-callback/imported-value case was separately checked and does flag; this finding is the distinct imported-callback escape.

### P1 — `tooling/src/verify/gates/vector-scope-derived.ts:123` — a DB-table import alias bypasses the write-home restriction

The gate recognizes canonical table import names, but the write arm compares the raw argument text to those canonical names. An alias therefore erases the match:

```ts
import { chatDigests as table } from "@orb/db";
export const write = (db: Db) => db.insert(table);
```

Evidence: the `vector-aliased-write` planted row at the allowed-reader path `packages/server/src/domain/search/persistence/probe.ts` returned `expected a finding but got 0` from `pnpm tsx reports/stickler/scratch/final-gate-probes.ts`. Inputs/state: a write is added in a sanctioned read home using an aliased vector table. Wrong outcome: the read home can mutate vector-owned data while the gate reports clean, defeating D20's one-home write ownership. The argument must be matched through the import symbol, including aliases and namespace access.

### P2 — `tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts:151` — transformed and property-derived locals escape the one-shot live-read detector, leaving migrated CT timing semantics unchanged

The local-initializer trace only recognizes a bare identifier whose initializer is directly an awaited browser read. A transformation between the read and assertion breaks the chain:

```ts
const width = await component.evaluate((el) => getComputedStyle(el).borderWidth);
expect(Number.parseFloat(width)).toBeGreaterThan(0);
```

Evidence: the `ct-transformed-local` planted row returned `expected a finding but got 0`. The escape is live in the target migration at `tests/ui/primitives/badge/badge.ct.tsx:40` and `:62`, where `Number.parseFloat(borderWidth)` is asserted after a one-shot `evaluate`. A stronger changed example is `tests/client/features/config/components/config-context-body.ct.tsx:121`: the new poll proves only that an object exists, then a fresh one-shot `page.evaluate` is stored and its `painted.transform` and `painted.size` properties are asserted outside the retry. Inputs/state: the DOM exists before its geometry/paint settles. Wrong outcome: the migrated test remains flaky or checks stale state despite the gate's claimed zero baseline. The detector must trace value flow through property reads and deterministic wrappers, or the assertions must themselves move inside the retry.

### P2 — `tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts:219` — any contiguous `ONESHOT-OK` substring suppresses a finding, including malformed and stale comments

The escape parser does not enforce exact grammar, a reason, or one-site consumption. This suppresses the following assertion:

```ts
// ONESHOT-OK
expect(await page.evaluate(() => document.activeElement)).toBe(document.body);
```

Evidence: the `ct-malformed-escape` planted row returned `expected a finding but got 0` from `pnpm tsx reports/stickler/scratch/final-gate-probes.ts`. Inputs/state: a bare or stale marker is left near a newly unsafe live read. Wrong outcome: the gate treats the assertion as reviewed forever without a reason or exact attachment. Gate Authoring §4.3 requires escape hatches to be two-sided: a precise valid escape is accepted, and malformed/stale/widened escapes must red.

### P2 — `tooling/src/verify/gates/contract-verb-presence.ts:54` — a contract verb is considered implemented when an unrelated receiver has a same-named method

The gate scans for property-call tails matching each interface method and never binds the receiver to the concrete service factory result. Minimal case: `HubService` declares `save`, while its implementation body calls only `logger.save()`. Evidence: the `contract-wrong-receiver` planted row returned `expected a finding but got 0` from `pnpm tsx reports/stickler/scratch/final-gate-probes.ts`. Inputs/state: a service contract gains a verb but the implementation omits it and happens to log through a same-named API. Wrong outcome: the contract presence gate reports clean and the runtime service still lacks the verb. The proof must bind the verb to the returned service object or the actual implementation symbol.

### P2 — `tooling/src/verify/gates/baseui-portal-container-seam.ts:51` — independent declaration and JSX checks do not prove caller-supplied container data reaches the Base UI portal

The gate accepts any exported interface containing `container`, and independently accepts any non-null portal expression. Neither proof binds the public prop to the component or to the portal attribute. Both of these pass:

```tsx
export interface InternalProps { container?: unknown }
export interface DialogProps { open?: boolean }
const portalContainer = document.body;
export const Dialog = (_p: DialogProps) =>
  <BaseDialog.Portal container={portalContainer} />;
```

```tsx
export interface DialogProps { container?: unknown }
export const Dialog = ({ container: _ }: DialogProps) =>
  <BaseDialog.Portal container={document.body} />;
```

Evidence: the `portal-unrelated-interface` and `portal-hardcoded-body` planted rows both returned `expected a finding but got 0`. Inputs/state: a themed/focus-contained caller supplies a portal container. Wrong outcome: the component ignores it and mounts under `document.body`, outside the caller's ThemeScope and containment, while the gate reports clean. The gate must prove prop-to-component-to-portal dataflow, not three independent shapes.

### P2 — `tooling/src/verify/gates/surface-a11y-focus.ts:64` — any descendant `focus()` call satisfies arrival focus, including click-time focus

The presence check is not related to mount/open lifecycle. This passes:

```tsx
export const Pane = () => (
  <button onClick={() => ref.current?.focus()}>Open</button>
);
```

Evidence: the `surface-click-focus` planted row returned `expected a finding but got 0`. Inputs/state: a surface opens and contains a focus call reachable only after a later click. Wrong outcome: keyboard/screen-reader focus remains behind the arrived surface, yet the gate reports an arrival-focus proof. The call must be symbol- and control-flow-bound to the surface's mount/open lifecycle.

### P2 — `tooling/src/verify/gates/surface-in-a-container.ts:25` — `<Section>` is treated as a container provider although the actual UI primitive establishes no container context

The accepted tag list includes both `Container` and `Section` and checks names rather than import identity. A surface/list wrapped only in imported `Section` therefore passes. Evidence: the `surface-section-is-not-container` planted row returned `expected a finding but got 0`. The coupled implementation confirms the semantic mismatch: `packages/ui/src/layout/section.tsx:61` renders `sectionVariants`; `packages/ui/src/layout/variants.ts:59` defines that root as only `flex flex-col gap-block`; the actual `@container` base belongs to `containerVariants` at `packages/ui/src/layout/variants.ts:246`. Inputs/state: a responsive descendant uses container queries under `Section`. Wrong outcome: it has no container-type ancestor and collapses to viewport/default behavior while the gate reports clean. Bind the accepted provider to the real `@orb/ui` `Container` symbol and remove `Section`; local lookalike `Container` tags should not count either.

### P2 — `tooling/src/verify/gates/warning-code-coverage.ts:78` — warning coverage credits an object pushed into any collection, not the provider's warning channel

The checker recognizes any `.push({ code, message })` within the provider scope. A provider tuple can therefore be covered only by `audit.push({ code: "provider_ok", message: "not a warning channel" })`. Evidence: the `warning-unrelated-push` planted row returned `expected a finding but got 0`; the chat warning was emitted correctly in the same fixture to isolate this miss. Inputs/state: an operation advertises the `provider_ok` warning code but never emits it to the warning output. Wrong outcome: callers cannot observe the condition, while the coverage gate reports clean. The push receiver must be bound to the actual warnings collection or canonical emitter.

### P2 — `tooling/src/verify/gates/zod-modern-spellings.ts:251` — one local alias around `parsed.error` bypasses the hand-flattening ban

The checker recognizes direct destructuring from `.error`, but does not trace an alias:

```ts
const failure = parsed.error;
const { issues } = failure;
return issues.map((issue) => issue.message).join("; ");
```

Evidence: the `zod-aliased-error-destructure` planted row returned `expected a finding but got 0`. Inputs/state: a validation failure carries nested paths and structured issue data. Wrong outcome: a hand-flattened string drops that structure while the modern-spelling gate reports clean. The property origin needs symbol/value-flow tracing through local aliases.

### P2 — `tooling/src/verify/gates/verb-naming.ts:24` — a callable type annotation makes a non-callable runtime initializer look like a valid exported verb

The exported-variable check accepts any inferred/annotated type with a call signature, without checking whether the initializer produces a function. This passes:

```ts
export const createStartChat: () => void = 1 as never;
```

Evidence: the `verb-typed-noncallable` planted row returned `expected a finding but got 0`. Inputs/state: a public verb retains a function-shaped annotation but is accidentally assigned a non-callable runtime value through a cast. Wrong outcome: consumers crash on invocation while the naming gate reports clean. The gate's callable proof must inspect/resolve the initializer or declaration value, not only the declared type.

## Verified clean

- Focused tooling behavior passed: `pnpm test:scoped tests/tooling/_shared/ratchet-rows.test.ts tests/tooling/verify/gates/verb-naming.test.ts tests/tooling/verify/gates/contract-verb-presence.test.ts tests/tooling/verify/lib/bus-coverage.test.ts tests/tooling/verify/ops/show.int.test.ts tests/tooling/ui-gate-structural-regressions.int.test.ts tests/tooling/warning-code-coverage.residual.test.ts` passed 7 files / 37 tests; `tests/tooling/gate-conformance.int.test.ts` passed 8; and `tests/tooling/ast/index.test.ts` passed 80. All three runs also reported no TypeScript errors.
- Focused migrated CT behavior passed: `pnpm ct:scoped tests/ui/primitives/badge/badge.ct.tsx tests/ui/primitives/virtual-list/virtual-list.ct.tsx --workers=2` passed 33/33 with no flaky or skipped tests. The probe rebuilt only ignored `playwright/.cache`; `git status --short` remained clean afterward.
- The adversarial probe suite ran all 16 rows in one process. Every row returned zero findings when at least one was expected; the two portal rows support one relationship finding, yielding the 15 findings above. The imported-callback `evaluate` project also returned zero tool errors, confirming a silent exemption rather than a fail-loud unsupported form.
- Structural sweeps used `ast-grep --inspect summary`: `$A.evaluate($B)` scanned 560 tooling TypeScript files and enumerated every live tooling evaluate call; `reconcileBusCoverage($A,$B)` scanned 560 and found the five wrappers named above; `blankTsCommentsAndStringsInText($A)` scanned 560 and found only the client test-presence gate; `ctx.report($A)` scanned all 229 gate files. Tooling has no TSX corpus (`-l tsx` scanned zero), so no negative claim rests on that zero-file run.
- The Active-Gates registry/D139 reconciliation is clean at the reviewed target. `docs/architecture/core/Core-Enforcement-Active-Gates.md` hashes to `268129e74ec7585bb585b91f5d14ca3a8ba186db0cb0e3c2f73f6d2fcc6f9005`; `docs/catalog/catalog.json:442` records that exact `verifiedSha`, `verifiedCommit: 6f1a32b33db471b46af0747f1fd9e486f04649f8`, and `verifiedAt: 2026-08-25`. The registry says 229 gates, matching the supplied authoritative 229/229, 16/16 static receipt. This review artifact itself will require the orchestrator's normal catalog refresh; the reviewer did not edit the catalog.
- The two current-head refutations were preserved. The motion-audit missing-evidence condition still fails loud rather than accepting an uninstrumented zero, and no schema migration or baseline drift was introduced by this diff; the earlier DB “actual drift” allegation therefore remains a checker limitation/refuted current-head claim, not a regression.
- The remaining original review repairs were exercised/read and did not produce a confirmed defect: missing asset/wire registries now red; gate conformance sees tool errors; `show` validates argv and preserves exit 2; Base UI derivation no longer uses loose substrings; bounded local constants and inline tRPC child routers are recognized; ratchet traversal rejects lexical/symlink escape; the story duplicate-JSX and fabricated-comments escapes are closed.
- `git diff --check 5ae85a33e..59fed45ee` was clean.

## Review coverage and unread regions

All 31 touched tooling gate/source files and the eight small touched tooling test files were read in full, including headers. `tests/tooling/ast/index.test.ts` is 2,073 lines: its header/helpers and complete changed `ast unwired lens` region (lines 1–250) were read, its changed diff was inspected, and its full 80-test behavior was run; untouched test regions at lines 251–2,073 were not read. The changed CT corpus spans more than 100 files and roughly 51,000 lines: every changed hunk was inspected through the complete 5,005-line migration diff, the five added `ONESHOT-OK` sites were inspected, a recursive AST census was run, and the confirmed residual files were read in full; untouched regions of every CT file were not read. For the 229-row Active-Gates document, the complete changed delta, header, row count/footer, hash, and catalog receipt were checked; unchanged individual row bodies were not reread. No user-visible application surface changed, so no live rendered UI/side-eye pass was required beyond the focused CT behavior.

## Unconfirmed suspicions

None. The review surface is closed at the confirmed set above.

Issue summary: Final stickler review of `5ae85a33e..59fed45ee` confirmed 15 gate-correctness defects (severity ceiling P1): six allow security/load-bearing ownership, bus, freshness, evaluate, or vector-scope false-cleans, and nine leave CT, portal, accessibility, warning, Zod, contract, or callable proofs semantically vacuous. Focused behavior passed 158 tests, the supplied 16/16 static receipt and D139 registry reconciliation remain intact, and both current-head refutations were preserved. Full evidence and minimal repros are in `docs/reviews/stickler/2026-08-25-gate-hardening-final-review.md`.
