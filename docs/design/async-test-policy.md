---
kind: design
status: complete
updated: 2026-08-26
---

# Async ownership and truthful test availability

Issue: #730
Base: `d4a89ca41c68dbb1ecdf80bb7234ebbca78003a8`
Status: implemented; focused verification complete

## 1. Outcome

The repository's async and test policy must describe runtime ownership rather than reward syntax. Sequential
work remains directly sequential. A Promise is awaited/returned, explicitly handled by an existing owning
boundary, or started inside one named supervised-detach boundary. Runner-unavailable evidence is reported by
the runner as skipped; a front door that promises required live evidence fails when every collected test was
skipped.

This changes policy and the affected call sites together. A config-only change would merely move the blind
spots, while a blanket Promise rewrite would invent concurrency and ordering the code does not authorize.

## 2. Re-derived census and migration boundary

### 2.1 Await-in-loop policy

`biome.json:308` globally enables `noAwaitInLoops`. The shipped-source census is 118 literal hits across 71
files, of which `packages/server/src/domain/automation/verbs/create-rule-from-preset.ts:66` is prose rather
than a suppression: 117 suppressions across 70 shipped files remain. The broader config-governed census is
109 tooling, 17 scripts, and 152 test mentions. Live suppression comments are ceremony once the rule is off;
they will be removed without changing any loop's scheduling shape. Fixture prose that exists to test a reader
is changed only when that reader's contract changes.

Coupled sites:

- `biome.json`: global rule off; the now-redundant probes override disappears.
- `tooling/src/verify/gates/suppressions.ts:56`: delete the rule ratification.
- `tooling/src/verify/gates/suppressions.baseline.json`: regenerate the real scanner's counts after the
  shipped comments are removed; other suppression counts/classes remain derived.
- `tests/tooling/suppressions.residual.test.ts:77`: replace the retired ratified-rule fixture with a live
  ratified rule so the partition arithmetic remains tested.

### 2.2 Floating Promise policy

Applying the actual typed ESLint config with `ignoreVoid:false` produces 111 diagnostics across 76 files:
78 client, 31 server, and 2 tooling. This type-aware population supersedes the review's narrower 98 raw
statement-form census. Both async-safety config blocks at `eslint.config.js:341,386` change to the explicit
`["error", { "ignoreVoid": false }]` form. Biome `noVoid` stays off: a syntax-only ban cannot distinguish a
Promise from a deliberate synchronous `void` expression and would recreate the same evasion pressure.

The exact server partition is:

- **7 owned/ordered emissions:** the chat delta stream plus six `emitChatChanged` calls. They are awaited or
  joined to an owned drain. None enters detach.
- **14 genuine detached starts:** two automation watcher dispatches, two workload-runner starts, automation
  plugin bootstrap, domain-bus subscriber dispatch, shutdown callback, automation lifecycle dispatch, four
  seeders, workload reaping, and the stream-room pump. These start through `superviseDetached`.
- **10 explicitly handled cleanup/serializer chains:** settings write-tail cleanup, three egress cleanups,
  plugin membrane + sandbox settlement, three model-cache cleanups, and zip iterator cleanup. Their existing
  cleanup/error ownership is preserved and made explicit without detach.

The 78 client sites do not use the server supervisor. A resultless `createEntityMutation` call may switch
from `mutateAsync` to its existing `mutate` door only where that door's documented `onError`/toast contract
owns the failure (`packages/client/src/data/create-entity-mutation.ts:49-62,145-164`). A value-consuming
operation is awaited/returned or gets a terminal UI-visible error path; catching merely to log and continue
is not ownership. Readiness/import/finalization chains receive a real rejection path. The two tooling poll
calls report their rejection through the tool's existing stderr/exit vocabulary.

### 2.3 Unavailable-test policy

`biome.json:266` bans honest skipped-test syntax. Thirteen Playwright arms instead append arbitrary
`{ type: "skipped" }` metadata and return (8 group-mode, 4 guided-generation, 1 round-trip-fidelity), which
does not change Playwright's outcome. Three local-light suites alias `describe`/`describe.skip`.

The migration is exact:

- the 13 optional environment/capture arms call runner-native `test.skip(condition, reason)`;
- the 3 local-light suites use `describe.skipIf(!RUN)`;
- `noSkippedTests` is disabled, while `noFocusedTests` remains error;
- `monotonic-tests` keeps its deleted-test-file ratchet, drops its skip-ban/`allow-skip` ceremony, and gains
  a precise tooth for `test.info().annotations.push({ type: "skipped" })`, the metadata shape that lies about
  outcome. Genuine `test.skip(condition, reason)`, `describe.skipIf`, `todo`, and runner-native skip syntax
  pass; arbitrary annotations that claim runner status do not.

Optional `@live` specs may all be unavailable and honestly skipped. `pnpm e2e:live` is different: it is the
manual required-credit front door (`tooling/src/verify/lib/registry-manual.ts:36-43`) and already selects a
self-seeding real-turn spec (`package.json:92`). That script enables an evidence-required reporter. The
reporter reads Playwright's collected outcomes at `onEnd`; zero non-skipped tests prints `INSTRUMENT ERROR`
and overrides the run status to failed. Routine e2e/offline runs do not enable that contract and retain their
ordinary skipped counts.

## 3. Chosen runtime mechanisms

### 3.1 Ordered chat deltas

`packages/server/src/domain/chat/engine/engine.ts:1469-1471` supplies a synchronous `onDelta`, while the
durable chat emitter returns a Promise and writes durable-first (`domain/chat/bus.ts:100-130`). The engine
will own a per-turn Promise tail:

1. each callback appends one `deps.emit(delta)` to the tail, preserving callback order;
2. the next append chains from the current tail without a rejection-swallowing recovery arm;
3. after the first/recovery pipeline settles, `runTurn` awaits the tail before warning, commit, or terminal
   emission;
4. the first rejected emit rejects the tail, prevents terminal success, and follows the engine's existing
   fault/abort classification. It never silently poisons the queue and then continues dropping deltas.

This is admission/ordering ownership, not detached work. The red test holds the first delta Promise and
proves neither terminal emission nor `runTurn` completion can overtake it; a second arm rejects that Promise
and proves the turn rejects and emits no terminal success.

### 3.2 Supervised detach

`superviseDetached(requestId, spanName, attrs, operation)` lives beside `withRequestSpan` in the existing
observability/tracing seam. It returns `void` deliberately: the caller is promised no ordering or completion.
The operation is a factory, not an already-started Promise, so work begins inside the detached root. The
helper owns the resulting Promise completely: `withRequestSpan` records a failed root, and its terminal catch
emits a structured operator-visible error containing the operation identity/request id. Repeating call sites
mint a fresh request id so the trace ring cannot treat a later operation as an orphan of an already-sealed
root. There is no callback for a caller to accidentally swallow or rethrow inconsistently.

The `detached-work-traced` gate derives root-opening wrappers and its examples/fix text migrate to this named
boundary. Its old recommended spelling, `void withRequestSpan(...).catch(...)`, is deleted: the gate may not
teach the escape the lint policy removes.

### 3.3 Required runner evidence

A Playwright reporter is the observation seam because only the runner knows whether a collected test really
executed. Source syntax, annotations, and collection counts cannot prove execution. The reporter uses
`TestCase.outcome()` after the run: `skipped` contributes no evidence; expected/flaky/unexpected outcomes did
execute. Existing failures stay failures; the reporter changes only the false-green all-skipped case.

## 4. Rejected alternatives

- **Keep `noAwaitInLoops` and improve comments:** rejected because the rule has no knowledge of ordering,
  locks, admission, bounded concurrency, or transactions. A better comment cannot make that inference true.
- **Autofix loops to `Promise.all`:** rejected because it changes scheduling and is the defect pressure this
  issue removes.
- **Enable Biome `noVoid`:** rejected because it is syntax-only and would ban harmless synchronous uses while
  adding no Promise-rejection proof.
- **Allow `void` through ESLint and add a naming convention:** rejected because `void` changes neither
  scheduling nor rejection behavior. The type-aware rule must see it.
- **One generic client/server `fireAndForget` helper:** rejected because UI mutation ownership, server
  lifecycle supervision, cleanup, and durable event ordering are distinct contracts. One helper would erase
  the distinction the migration exists to expose.
- **Pass an already-started Promise to the supervisor:** rejected because the operation can reject before the
  trace/log owner attaches and begins outside the claimed supervision scope.
- **Catch chat delta rejection and continue:** rejected because a missing durable delta followed by terminal
  success is a corrupt event history. The turn must fail before terminal success.
- **Ban all skip syntax structurally:** rejected because it recreates annotation-and-return evasion. The
  invariant is truthful runner status, not the absence of a word.
- **Count skip annotations or test declarations for required evidence:** rejected because neither is an
  executed runner result; both can confidently report evidence that never ran.

## 5. Red-first and verification plan

Red-first controls:

1. Engine held-delta and rejecting-delta cases fail on the old fire-and-forget callback.
2. Typed ESLint policy fixture proves `void rejectingPromise()` currently passes, then fails after
   `ignoreVoid:false`; awaited, terminal-catch, and `superviseDetached` examples pass.
3. `monotonic-tests` conformance plants annotation+return and requires a finding; runner-native conditional
   skip fixtures pass.
4. Reporter hook simulations plant all-skipped outcomes (failed + `INSTRUMENT ERROR`) and a mixed
   passed/skipped population (no override).

Graduation runs are scoped to the tier changed: engine behavioral integration; gate conformance/residual
tests; reporter tests and a scratch Playwright all-skipped simulation where practical; scoped ESLint over the
typed affected surface; TS6 ESLint compatibility plus the repository's TS7 package/root type programs; Biome
over touched files. The orchestrator owns the one authoritative integration hook, so the lane does not
duplicate the full/structure lock-taking battery.

## 5.1 Implementation receipts

- The retired loop rule left 0 live `noAwaitInLoops` suppressions. The regenerated suppression floor is 159
  sites across 108 files, all ratified and 0 debt.
- Typed ESLint is green with `ignoreVoid:false`; the production migration contains no raw-void escape for a
  Promise. Ordered/durable work is awaited, and only operations whose callers explicitly need no ordering use
  the supervised factory boundary.
- Chat engine integration: 72/72 passed, including held-delta ordering and rejection-before-terminal arms.
- Workload runner integration: 11/11 passed, including failed-lease abort/unwind ordering; observability
  unit: 6/6 passed; LogViewer CT: 16/16 passed.
- Required-evidence/config policy: 4/4 passed, including actual Playwright all-skipped exit failure and a
  mixed executed/skipped pass. Gate descriptor conformance: 8/8 passed. The larger check-gates harness was
  6/7 on the old base solely because its `user-bus-coverage` plant used an arbitrary literal; current main
  already repairs that independent stale plant with a canonical emitter call.
- TS7 client/server/tooling/tests-dom programs, full typed ESLint, and Biome over the changed code/config
  surface passed. The orchestrator retains the authoritative post-integration hook.

## 6. Coupled-site inventory

- `biome.json`, `eslint.config.js`, `package.json`, `playwright.config.ts`.
- Shipped no-await comments plus `suppressions.ts`, its baseline, and residual test.
- `tracing.ts` + observability front door + `detached-work-traced.ts` conformance.
- The 76 typed affected files (78 client, 31 server, 2 tooling diagnostics).
- `engine.ts` + `tests/server/domain/chat/engine/engine.int.test.ts`.
- Three Playwright live specs, three local-light suites, `monotonic-tests.ts`, its active-gate row, and
  `tests/tooling/check-gates.int.test.ts`'s planted skip fixture.
- Required-evidence reporter + focused reporter tests.

## 7. Prior lesson used

Project memory's “Loaded-suite verification and async indexer repair” lesson
(`rollout_summaries/2026-08-20T03-21-35-tBbE-orbweaver_codex_folders_indexer_test_push.md`) established the
same ownership rule in tests: await the real completion Promise instead of bounded `setImmediate` polling.
This design applies that lesson to production event ordering. Its historical choice to leave production
fire-and-forget untouched is intentionally superseded by #730's reproduced production ordering defect.
