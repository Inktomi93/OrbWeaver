---
kind: law
status: active
updated: 2026-09-10
---

# Orbweaver — Spine: Testing

Testing policy: central source mirrors, registered test kinds, isolated fixtures, and native runner verification. `Core-0-Architecture-and-Structure.md` §5 owns layout. `tooling/src/_shared/test-kinds.ts` owns the executable kind vocabulary; native runner configs own execution, and the verification registry owns tier admission.

## 0. The principle

Tests prove behavior or type contracts. Their filenames declare kind and compiler intent; they do not substitute for assertions. Gates enforce layout, required presence, fixture boundaries, determinism, and runner/compiler membership. A rule that prevents a known silent regression needs a planted failing control and a valid passing control.

## 1. Test kinds and execution

| Suffix | Compiler world | Executor | Purpose |
| - | - | - | - |
| `.test.ts` | Node | Vitest | Pure behavior and structural assertions |
| `.dom.test.ts` | DOM + Node | Vitest in Node | Browser-subject behavior that needs DOM declarations but no browser execution |
| `.int.test.ts` | Node | Vitest | Real persistence, I/O or composed service behavior |
| `.repo.int.test.ts` | Node | Vitest | Integration behavior that requires the repository resource |
| `.contract.test.ts` | Node | Vitest | Parsing, serialization and wire contracts |
| `.test-d.ts` | Node | Vitest typecheck through the shared TS7 wrapper | Type-only contracts |
| `.dom.test-d.ts` | DOM + Node | Vitest typecheck through the shared TS7 wrapper | Browser type contracts |
| `.ct.tsx` | DOM + Node | Playwright CT | Rendered component behavior |
| `.spec.ts` | DOM + Node | Playwright E2E | Full-stack behavior |

`.repo.int.test.ts` is the registered integration/Node/module-mirror kind for tests that require the repository resource. `.suite.test.ts`, `.suite.int.test.ts` and `.suite.ct.tsx` mark a property spanning multiple source modules. They use the same executor as their family and are exempt from a single-module mirror. Unsupported test-shaped filenames fail `test-layout`; registering a kind must update every relevant consumer and prove native collection before adoption.

Compiler world follows the contract being checked. Component props, element identities, refs and browser events require real DOM declarations. A successful Node compile alone is insufficient: React provides fallback DOM declarations that can make distinct browser types indistinguishable. Pure logic can remain Node-owned even inside a UI package. Do not classify every test by package directory or maintain per-component exceptions.

Runtime and compiler ownership are separate. A `.dom.test.ts` has DOM declarations but no DOM runtime; code that needs a rendered browser belongs in CT. Test-only helpers live under `tests/support/{iso,node,browser}` according to their dependency needs. Browser stories and component tests retain the DOM compiler world.

- `pnpm test:node` runs product Vitest projects; `pnpm test:tooling` runs instrument projects. `pnpm test` composes product Node tests and the full CT run. Type-only projects use `pnpm test:types`.
- `pnpm typecheck [--config <repo-relative-tsconfig>]...` is the one native compiler door. With no configs it discovers every runnable program through the shared compiler reader; scoped verification forwards every affected program as repeated configs through the single `types:native` stage. Type assertions and ownership reconciliation remain separate stages.
- `pnpm check` selects the static verification tier. `pnpm verify --push` adds the product behavioral battery, CT and E2E smoke. The verification registry is authoritative for current stage admission.
- Native compiler membership reports distinguish authored roots, imported closures and intended ownership. Merely appearing in some import closure does not prove that a test has the correct compiler owner.
- Native Vitest and Playwright collection is the execution oracle. Reconciliation must detect unclaimed tests, duplicate claims and empty views; duplicating config globs in the checker is not independent proof.
- Integration fixtures default to isolated resources and parallel execution under the shared capacity profile. Scheduling restrictions require a current resource or measurement reason; historical slowness does not establish serialization or mutation ineligibility.
- Vitest execution groups (called projects by the Vitest API) derive their selectors from `tooling/src/_shared/test-kinds.ts`; there is no hand-maintained filename roster. Normal groups run at `sequence.groupOrder: 0`. The `repository` group selects registered kinds whose resource is `repository`, runs after them at group order 1, and uses `fileParallelism: false` to serialize files within that group.

Ownership enforcement claims require planted positive and negative controls through the real verification path. The linked type-world program owns migration and acceptance state.

## 2. The tree

```text
tests/
├── support/                    shared fixtures and data; no source mirror
│   ├── fixtures.ts             composed product test/expect
│   ├── tool-fixtures.ts        composed instrument test/expect
│   ├── factories/              pure makeX and persisted seedX builders
│   ├── iso/                    platform-independent helpers
│   ├── node/                   Node drivers, filesystem and network helpers
│   └── browser/                browser helpers and CT providers
├── <package>/                  mirror packages/<package>/src for registered workspaces
├── tooling/                    mirror tooling/src where a tool home exists
└── e2e/                        full-stack Playwright tests
```

`support/` and `e2e/` are exempt from source mirroring, but tests there still require valid kinds and runner/compiler ownership. A tooling test mirrors its tool module when that tool directory exists; flat config tests and research subjects without a tool directory retain their documented exemption. Related kinds stay beside one another at the source mirror. The registry defines which source extensions each test kind can mirror.

## 3. Determinism + mock doctrine

**Determinism — no wall-clock, no randomness in a test or factory.** The frozen clock is a plain injected DI object (`support/clock.ts`: `createFrozenClock(startMs?)` returns `{ now, advance, frozenAt }` — `now()` reads a mutable counter, `advance(ms)` moves it, `frozenAt` is the fixed start; `FROZEN_AT_MS` is the shared epoch every factory stamps rows from). It is NOT global-timer interception — there is no Luxon `Settings.now`, no `vi.useFakeTimers`; the composition root takes `now` as a dep exactly like production (`core/Tier-5-Entry.md`), so tests exercise the real injection seam rather than a monkey-patched global. Seeded ids come the same way (`support/ids.ts`, counter-backed). Ambient `Date.now()`/`Math.random()`/unseeded `typeid()` under `tests/` is RED (gate: `test-determinism`); a test needing time to move calls `advance()`, never a real timer. (The one sanctioned `vi.useFakeTimers` is the idle-timeout unit test, §6.)

**Non-vacuity control — prove the guard path FIRES before trusting a negative assert.** A test whose whole point is "X is refused / dropped / blocked" is worthless if the setup silently never reached the guard — the negative assertion passes vacuously. The pattern: a POSITIVE control in the same test (or its sibling) that drives the guarded path to its allowed outcome under the same wiring, so a mis-wired fixture fails the control instead of green-washing the refusal. Exemplars: `db-batch-atomicity.suite` (proves the batch COMMITS before proving a mid-batch failure rolls the whole thing back) and `touch-target-floor.suite` (proves a compliant target PASSES before asserting an undersized one is flagged). Reach for a control whenever the assertion is an absence.

**Mock doctrine — fake at the edges, inject at the root, never mock an internal module.**

- **DB:** real libSQL `:memory:` for `.int` (`freshDb`). Never mocked — the point of the cake is that persistence is real, cheap, in-process.
- **The model / provider:** the only true external I/O — faked at the `runChatTurn` seam, never below it. Tests script it with the TAPE fixture (`tests/support/chat/tape.ts`): `tape()` lists ordered role responses and `scriptedRunner(tape)` presents them as the injected `RunChatTurnOp`, dequeuing FIFO per turn (a group round drives N entries). Under-scripting throws a LOUD exhaustion error, never a silent cycle; a rate-limit/error surfaces as a thrown `ProviderError` (assert with `toThrowProviderError(kind)` — the field lives on the provider `ChatResult` below this seam). The production analogue is the RUNNER\_OVERRIDE seam (~~`infra/providers/scripted-override.ts`~~, cycles by design) — *(PHANTOM-REF — no such file exists on the tree; truth-audit 2026-08-03. Its one named consumer, the neo parity oracle, was ripped out 2026-08-22 (#428). Left as the design record if the replay seam is rebuilt.)* Provider request *shape* is pinned by `.contract` tests; *behavior* is scripted.
- **Cross-feature deps:** inject a fake at the composition root, never `vi.mock()` a sibling module. If a collaborator needs stubbing and isn't an injected port, the test just surfaced a design smell.

`vi.mock` of an internal module is gated (`test-mock-doctrine`); its only legitimate use is an unavoidable third-party node edge, justified in a comment.

## 4. The fixture + factory contract

**Fixture doctrine:** composed `test.extend`, never `beforeEach` sprinkled per file. `tests/support/fixtures.ts` exports the project `test` (typed, lazily-initialized — a fixture only runs if destructured); import `{ test, expect }` from there, never raw fixture modules (gate: `test-fixture-imports`). Fixtures grow as needs land (clock + ids today; a scoped `db` and caller fixtures join the same composed `test`, not per-file setup).

**Custom matchers (cap at 5):** each must appear in ≥10 sites or encode a domain invariant whose diff message beats a generic `toEqual`. No generic equality/impl-detail/framework wrappers. (Root config already enforces `expect.requireAssertions` — no assertion-free tests.)

**Factory contract** (every `support/factories/*.ts`; gate: `test-factory-contract`):

- `makeX(overrides?: Partial<X>): X` — pure builder, fully-valid deterministic defaults (seeded ids, frozen clock), never touches the db.
- `seedX(db, overrides?: Partial<X>): Promise<X>` — `makeX` then insert.
- Defaults valid + minimal; overrides shallow-merge; relations are ids by default (`seedChat(db, { withCharacter: true })` is explicit). Factories live only in `support/factories/`.

## 5. The presence rule — what MUST have a test

`test-layout` enforces *where*; `test-presence` (`tooling/src/verify/gates/`) enforces *that*, on exactly the surfaces where an untested change silently breaks behavior — no blanket per-file coverage (that breeds assertion-free filler):

| Surface | Required test |
| - | - |
| every `domain/<f>/verbs/*.ts` | ≥1 `.test.ts` or `.int.test.ts` at its mirror (the verb IS the behavior; the service façade is covered transitively) |
| every `contract/*.ts` exporting a zod schema | a `.contract.test.ts` (parse + round-trip) |
| every `persistence/*.ts` | a `.int.test.ts` against `freshDb` (queries are only "correct" against a real db) |
| **every OTHER `domain/**` file with runtime logic** — `substrate/`, a named subsystem (`engine/`, `assembly/`, `memory/`, `themes/`…), `guard.ts`, a sanctioned feature-root singleton, a `contract/` file carrying real logic | a `.test.ts` or `.int.test.ts` |
| infra/foundation files with runtime logic | a `.test.ts` or `.int.test.ts` (security belts, adapters, dispatchers) |
| **every `entry/**` + `transport/**` file with runtime logic** — a boot step, a composition seam, an HTTP registrar, a job driver, a bus, a ladder primitive | a `.test.ts` or `.int.test.ts` |

The domain arm is DEMAND-BY-DEFAULT (#767, 2026-08-28): it was an enumerated slot list, the template outgrew
it, and 127 files with runtime logic — 54 in `substrate/`, the second-largest slot in the tree — sat outside
the demand with no violation and no exemption record. The demand is now the RESIDUAL, so a slot the template
grows is demanded the day it appears. The residual population that widening exposed rides a shrink-only DEBT
ratchet (`tooling/src/verify/gates/test-presence.baseline.json`, enumerable with `pnpm debt`); it is another
lane's named burn-down, never a permanent pass.

The `entry/` + `transport/` TIER arm (#773, 2026-08-30) is the same widening applied to the two tiers the old
demand never reached: 94 of their files carry runtime logic, 65 were already tested and merely undemanded, and
the residual included the opaque frame-handle store — a SECURITY primitive whose owner check is the whole
no-existence-leak property — with no test at all. Its exemption is derived from what the tier law says these
tiers may contain (`core/Tier-5-Entry.md` invariant 1: "`entry/` owns no business logic — only wiring/boot/
HTTP-edge"; `core/Tier-4-Transport.md`: a router is "validate → call the verb → map the error, zero business
logic"), so WIRING is exempt and behavior is not.

Exempt by nature — all detected on SHAPE, never a path list, so a file that grows logic loses the exemption:
`index.ts` barrels, the zero-logic `service.ts` composition root and `context.ts` DI bundle at a feature root,
a `contract/` file declaring only error classes (and a pure-type one, which carries no runtime logic at all),
and a D58 no-op stub runner. In the tiers, additionally: a `.d.ts` declaration file (no runtime to assert), a
tRPC router shell (a `router({…})` binding is no callable export, so it is exempt for free), and a
PASS-THROUGH wiring file — every exported callable's body reducing to ONE expression that is a delegating
call, a DI-bundle object literal over its own parameters, or a factory returning one of those. A second
statement, a branch (including a ternary), or a computed argument is behavior and stays demanded. Browser
lanes are not generally presence-gated. The deliberate exception is the standing #883
`worst-legal-art-contrast.suite.ct.tsx`: `test-presence-client` requires that one cross-cutting rendered floor
because deleting it restores a known blind class across every theme polarity at once.

**`test-presence` checks EXISTENCE, not coverage:** it confirms a store's mirror `.ct.tsx` EXISTS — NOT
that new actions are ASSERTED. Adding an action to an existing store passes presence WITHOUT covering it.
Every NEW `#state` action / projection / non-trivial behavior gets an assertion in the mirror (drive it,
assert the resulting store state — a dual-write writes BOTH channels). Old tests passing ≠ new behavior
tested.

**Coverage: REPORT-ONLY.** v8 provider, `pnpm test:coverage`, NEVER inside `pnpm check`; no `thresholds` block until a real baseline exists — then pin GLOBAL thresholds and ratchet UP as a backslide floor. For "do these tests catch bugs?" use mutation testing (§9), not a coverage number.

## 6. The "what to test" obligations, gathered

- **The \~150 "preserve exactly" esoterica** (`Core-Planning-and-Checklists.md §C2`) — each load-bearing behavior becomes a named test at its mirror. Headliners: the GCM AAD byte-string `${userId}|${provider}`, the ZWSP in `neutralizeMacros`, the PNG dual-chunk + CRC, the vLLM death-couple pipe-watchdog, `storedVersion`-beats-probe, the last-owner / owner-immutability guard (D17), `deepMergeRequestBody` Layer-2 defense, every `ASSUMES(single-replica)`.
- ~~**The differential oracle**~~ — RIPPED OUT 2026-08-22 (#428, owner: "we exceeded neo a while ago"). The `.parity` lane, its driver and its captured neo reference are gone; git preserves them, and the campaign record is `../history/neo-orb-parity-audit.md`. Nothing is measured against neo any more.
- **Memory's chat-scoped semantics** — a "could silently regress" surface the oracle never covered either (memory is a rewrite, not a port). Each → a named `.int.test.ts` at the memory mirror.
- **Serde round-trip** — import → export → reimport hash-identical, a `.contract.test` invariant on the one serde core (`core/Spine-Config-and-Serialization.md` §7.3).

## 7. Client / browser tests — Playwright, NOT Vitest browser

Vitest browser-mode is FORBIDDEN — cold-cache dep-discovery *hangs*. Two Playwright lanes, neither in `pnpm check`:

- **Component — Playwright CT** (`@playwright/experimental-ct-react`): `*.ct.tsx` at the mirror, `playwright-ct.config.ts`, `pnpm test:ct`. Mount wraps the component in `CtProviders` (`tests/support/browser/ct-providers.tsx` — the production provider stack: fresh `QueryClient` per mount with `retry:false`, real tRPC over `httpLink`, the real toaster). tRPC is stubbed at the **network** boundary with Playwright `page.route` (the `tests/support/node/route-trpc.ts` helpers) — **NOT MSW**: CT runs the test in node and the component in the browser, so node-side `vi.fn` closures can't run in the browser worker. Story wrappers (`_ct-stories.tsx`) hold the components CT mounts (CT only mounts from a non-test module).

- **e2e** — `*.spec.ts` under `tests/e2e/`, `playwright.config.ts`, `pnpm e2e`: the full running stack.

- **Locator priority:** `getByRole` ≫ `getByLabel` ≫ `getByPlaceholder` ≫ `getByText` ≫ … ≫ `getByTestId` (last resort, never for buttons/inputs). **Real timers in form tests** (fake timers drift against React 19's scheduler + debounce — assert with Playwright's auto-retrying `expect`).
  **The CT harness's own physics** — each of these produces a green, a hang, or a timeout that reads like a
  product defect. They belong to the RUNNER, not to any component:

- **`mount()` is once per test** (a second call throws "container that already has a React root") — a prop
  matrix is N tests or one mount + `component.update()`. **The locator `mount()` returns IS the fixture
  root**, so `mounted.getByTestId(<the root's own id>)` searches DESCENDANTS, matches nothing, and fails as
  a 30s TIMEOUT rather than an assertion diff.

- **A `.ct.tsx` may import only COMPONENTS from its story module.** A mixed value export breaks the CT
  transform with `Identifier … already declared` + a bogus "No tests found"; shared constants live in a
  non-story fixtures module. `@orb/ui/icons` (mixed component+glyph exports) cannot be imported in a
  `.ct.tsx` at all — put the JSX in a `.fixtures.tsx`.

- **A story mounting a suspending component MUST wrap it in the production `QueryBoundary`** — a bare mount
  is a silent infinite mount/refetch loop (no thrown error, just a hang). Read the component's production
  mount site and copy its boundary wiring.

- **CT serves PRODUCTION React and runs NO React Compiler pass** (both deliberate): StrictMode's
  double-invoke is unreachable — reproduce double-lifecycle edges with a keyed remount — and a CT red that
  "the compiler would have memoized away" is a REAL defect, fixed at the source (identity), never with a
  manual memo.

- **The CT `QueryClient` is bare** — no `MutationCache.onError` → `errorToast`/`notify` seam. Mutation-error
  COPY is unobservable in a CT; prove the mapper with a unit test, or render the error inline.

- **`page.addInitScript` never fires** (the `page` fixture has already navigated) — install pre-mount
  instrumentation with `page.evaluate` BEFORE `mount()`.

- **CDP media emulation LEAKS across tests in a file**, and `page.emulateMedia` does NOT clear a feature it
  doesn't model — every emulation caller states the TOTAL media state in one call, including explicit
  `no-preference` for the features it does not exercise.

- **`getComputedStyle` on a DETACHED element returns `""`**, not resolved defaults — a sentinel read off a
  fresh `createElement` silently inverts every comparison against it. Attach the probe, then remove it.

- **Timing reads are measurements, not barriers.** `expect.poll` drains the caller's own intervals array and
  abandons its timeout tail; a computed value read across a transition lands MID-INTERPOLATION (assert a
  range, or read atomically in one `evaluate`); a layout-shift entry needs a PAINTED previous position. A
  transient window (a lying "Saved" during a debounce) needs a recorded TRANSCRIPT (a `MutationObserver`
  started before the interaction), never a poll that races it.

- **Prove an ABSENCE with a round-trip barrier, never a monotonic counter** (a poll passes on a transited
  value); `page.waitForTimeout` is gate-banned. And barrier on a SETTLED rendered state — a node-side
  request count is not a browser-side settle.

- **A stub at the seam under test is a tautology.** A fixed-array responder passes every FILTER test while
  the filter is wrong: a CT proving a server-side lens uses an INPUT-AWARE responder (it filters/sorts by
  the request it received) so a lens that ignores its input goes red. Whatever a CT fakes, something else
  (an `.int` test through the real verb, or a live drive) owns that seam's truth.

- **A source-neuter "bite proof" lies for a bare `@orb/*` import** — vite's `optimizeDeps` serves a
  PREBUNDLED copy that clearing `playwright/.cache` does not invalidate. Relative-path (`_*-stories`)
  imports compile fresh; for bare-import wiring tests, prove the bite with in-test rendered pre/post
  controls.

- **Lane invocation** (the whole-tree `pnpm test:ct` is the orchestrator's instrument on a quiesced tree):
  `pnpm test:ct <paths>`. The supervisor owns run/cache coordination and build identity. A CT report with
  ONE suite means the BUNDLE FAILED TO BUILD, not that the named spec failed.

- **`pnpm test:node` does not run CT.** A shared provider or registry Context change can break rendered
  stories while Node tests remain green. Such changes require the relevant `pnpm test:ct` coverage;
  `pnpm test` includes the full CT run after its Node run.

## 8. Tags (Vitest 4.1+) — the runtime axis, orthogonal to suffix

`tooling/src/_shared/test-tags.ts` owns the registered Vitest tag names and options. The runtime uses `strictTags: true`; the test-only ambient augmentation derives the same closed name union for TypeScript. Register a tag when a real test needs it, rather than reserving hypothetical categories. The `slow` tag preserves a 30-second timeout without adding retries. Select tagged cases through native `--tagsFilter=slow` or a negated expression.

Tags describe cross-cutting test requirements; suffixes retain test kind and compiler-world meaning. Mutation filtering uses declared capabilities rather than filename lists. Tags filter callbacks after module import, so they cannot isolate import-time side effects or supply repository/process capabilities missing from the runner. A capability exemption needs a native runner proof and must remain visible in collected/executed test accounting.

Vitest live-provider suites carry `live` and are excluded unless `E2E_LIVE=1`; local ONNX suites carry `local-model-cache` and require `ORB_LOCAL_LIGHT_E2E=1`. Backend construction and live model discovery happen inside selected callbacks, so default collection cannot activate them. Pure backend-matrix checks remain untagged. The mutation overlay excludes both categories even when those environment opt-ins are present.

Playwright uses its own `@smoke`/`@live` tags: `pnpm e2e:smoke` selects smoke cases, while real-provider cases remain opt-in through its live entry point. The shared `E2E_LIVE` spelling expresses operator intent; each runner retains its native selection mechanism.

## 9. Mutation testing (Stryker) — the test-quality ratchet

Coverage proves a line *ran*; a **surviving mutant** is a line a test covered but never actually checked — a test that asserts presence-of-behavior without asserting correctness. Two lanes, both on-demand / CI, never in `pnpm check` (runs are minutes):

- `pnpm test:mutation` (`stryker.config.js`) — exploratory, `break:null`; broaden scope via `--mutate`.
- `pnpm test:mutation:gate` (`stryker.gate.config.js`) — the calibrated ratchet. Its native config owns the target set and break threshold; changing either requires a fresh calibration.

Both run the node lanes via the `vitest` runner (`vitest.stryker.config.ts`) + the `typescript` checker, on
the **native TypeScript 7 preview** (`typescriptChecker.experimentalNativePreview`) over a **patched**
`@stryker-mutator/typescript-checker`.

**The checker is part of the calibration, not a performance knob.** It decides which mutants are
`CompileError`, i.e. which mutants are in the DENOMINATOR — so a `break` calibrated under one checker and
enforced under another is a mis-calibration. The patch exists because the stock preview is silently wrong
here: it registers the *sanitized* tsconfig (the `allowUnreachableCode`/`noUnusedLocals`/`noUnusedParameters`
overrides mutation testing requires — mutants violate all three by construction) under the raw
`tsconfigFile` string while the compiler opens the *resolved* path, so the lookup misses and it falls back
to the strict on-disk config. Unpatched, the whole `if (cond)` → `if (false)` mutant class is disqualified
via TS7027 and leaves the score. Measured on one file, 47 mutants: stock native 57.89 in 9m41s; patched
native **66.67 in 2m50s**; classic **66.67 in 3m17s** — same verdict, slightly faster. Full four-arm
receipts live in `docs/reviews/mutation-config-calibration.md`.

**An ARID mutant is not a test failure.** `tooling/src/mutation-arid/` (a `PluginKind.Ignore` plugin,
wired through `ignorers: ["arid"]` in BOTH configs) drops two families that are unkillable BY DESIGN:

1. **Observability sinks** — string-literal mutants whose only destination is a trace recorder,
   trace-collection append, trace assignment, trace-carrying payload object, or a logger call. The "fix"
   would be a test pinning a debug label byte-for-byte, i.e. the tautology this doc bans.
2. **Compile-time-unreachable arms** — every mutant inside a `default:` case (or block) that declares a
   `never`-typed binding. `tsc` has already proved the arm cannot execute, so no test can reach it; the
   exhaustive-dispatch discipline (`Spine-TypeScript-and-Patterns.md`) puts one in EVERY dispatch site,
   which makes this dead weight under every score computed over a dispatching file. Measured 2026-08-26
   with `pnpm mutation:probe` on `domain/admin/guard.ts`: 6 of its 8 planted survivors were exactly this
   — 25% of that file's denominator.

Family 2 matches the ARM node, so Stryker's whole-subtree ignore is the point; family 1 matches the leaf,
because matching the enclosing call would swallow real mutants among its arguments. The predicate is
STRUCTURAL — there is no in-source annotation an author can add to silence their own mutant — and it is
bite-proved in BOTH directions by `tests/tooling/mutation-arid/`. Adding or removing it CHANGES THE
DENOMINATOR, so it is part of the gate's calibration, never a cosmetic: `pnpm mutation:arid <report.json>`
prints the ignored count per reason, and a change in that count means `break` must be re-measured.

**A reported survivor is not ground truth either.** `pnpm mutation:probe <report.json> <source-rel>` plants
each reported mutant and runs the source's mirror suite, naming the tests that kill it. Measured 2026-08-22
over `assemble.ts`, 184 of 230 reported survivors were already killed by tests on the tree — perTest
coverage credits module-load-scope mutants to whichever unrelated test loaded the module first. Adjudicate
before writing kill-tests for a survivor list.

**The gate's `mutate` list is frozen to its calibrated set; new candidates enter the EXPLORATORY config as
sentinels** (`stryker.config.js` — currently the runtime-string-key and shipped-inversion classes: chat
stats-delta, stats rebuild-from-canon, chat canon-write, chat memory recall). Promoting a sentinel into the
gate requires a fresh calibration run, because `break` is bound to the measured set.

## Esoterica (load-bearing)

- The fixture is the composed *production* wiring with the model scripted — tests exercise the real injection graph, not a parallel test-only assembly. A divergence between test and prod wiring is a bug.
- **`isolate: true` for all Node projects** (the Vitest default): each test file receives a fresh module graph. Root mock/global/environment cleanup remains inherited by every project. Database integration fixtures own their in-memory databases; resource isolation is what makes parallel execution correct.
- Repository-resource tests declare that requirement through their registered kind rather than a hand-maintained filename roster. `vitest.config.ts` derives the `repository` execution group from that data and serializes its files after the ordinary groups. Other integration tests remain parallel under the shared capacity profile. The dependency-cruiser battery uses an isolated scratch corpus. The former separate browser-drive shard is retired: its appearance/theme suites assert structural state and pass concurrently in tooling.
- **Timeout scaling and measurement validity differ.** `scaledBudget` stretches completion deadlines. `labelRateLoad` records a measured arm as `load-suspect` when contention prevents judging its threshold; the measurement still runs and its number remains available. The supervisor surfaces the task metadata. A wider deadline cannot make a dropped-frame percentage valid, and a browser dependency alone does not make an assertion a measured-rate test.
- Determinism is a *correctness* property: the frozen clock is what makes the rolling-pair breakpoint and memory-recall ordering assertions stable turn-to-turn.
