---
kind: law
status: active
updated: 2026-08-22
---

# Orbweaver — Spine: Testing (one centralized tree, suffix-selected lanes, Playwright for browser)

Canonical doc for the testing thread every domain doc defers to (`→ test-time` notes). BUILT — current law. The *layout* is locked in `core/Core-0-Architecture-and-Structure.md §5` (one central `tests/` tree mirroring `src/` 1:1 + the `test-layout` gate); this doc is the *policy*: lanes, presence rule, mock/determinism doctrine, factory contract, tags, coverage, mutation.
**Design choice (intentional):** ONE centralized `tests/` tree, test KIND by **filename suffix** (a lane = a glob/`--project` filter), not a category-directory split; browser tests run on **Playwright, never Vitest browser-mode** (§7). Where each choice came from: `history/spine-testing-archaeology-record.md`.

## 0. The principle

The test path is a derivation (prefix-swap mirror), the kind is a suffix, gates force both: `test-layout` (mirror), `test-presence` (§5), `test-determinism` (§3), `test-fixture-imports`/`test-factory-contract` (§4), `test-mock-doctrine` (§3) — all in `tooling/src/verify/gates/`.

## 1. The lanes

Node lanes are `test.projects` in the ONE `vitest.config.ts`, selected by suffix (`test.projects` IS the modern "workspace" — `vitest.workspace.ts` was deprecated in Vitest 3.2). Browser lanes are separate Playwright runners with their own configs.

| Suffix | Lane (`--project`) | Runner | Touches | Gates at |
| - | - | - | - | - |
| `.test.ts` | unit | Vitest (node) | nothing — pure logic, kit primitives, dispatch, SHAPE | pre-push (`pnpm test`) |
| `.int.test.ts` | integration / integration-serial | Vitest (node) — parallel; a pinned path-set runs serial (§Esoterica) | real libSQL `:memory:` (`freshDb`) | pre-push (`pnpm test`) |
| `.contract.test.ts` | contract | Vitest (node) | a stable *shape* — zod round-trip, serde, wire body | pre-push (`pnpm test`) |
| `.test-d.ts` | types | Vitest typecheck (`tsgo`) | `expectTypeOf` over branded/union contracts, no runtime pass | pre-commit (`pnpm check`) |
| `.ct.tsx` | component | Playwright CT | a real browser; one component | on-demand (`pnpm test:ct`) |
| `.spec.ts` | e2e | Playwright | the full running stack | on-demand (`pnpm e2e`) |

- Node lanes are the five `test.projects` in the ONE `vitest.config.ts`: unit / integration / integration-serial / contract / types. `pnpm test` runs unit + integration + integration-serial + contract; types is opt-in (own script). (A sixth `parity` project drove the neo differential oracle until 2026-08-22 — ripped out with the oracle, #428.) `.int.test.ts` runs PARALLEL by default (`maxWorkers` 14); the explicit `SERIAL_INT` path-set (tree-writing tooling self-tests + heavy full-composition files) is EXCLUDED from `integration` and run one-at-a-time by `integration-serial` — routed by PATH, not a suffix (a `.serial.` rename would trip the structure gates). §Esoterica has the why + how-to-add.
- **The commit/push split (`lefthook.yml`, both via the one `pnpm verify` entry):** pre-commit = `pnpm check` (= `verify --static`): Biome + per-package `tsgo` + the type lanes + structure gates + dep-cruiser, \~30s. pre-push = `pnpm verify --push`: the static bundle + `pnpm test` (node lanes) + the Playwright CT suite + `pnpm e2e:smoke`. Behavioral + browser tests are deliberately NOT in `pnpm check` — the static tier can't hold browser (vitest-browser hangs, §7).
- **The types lane is five `verify` stages, not one** (each catches a class the others miss): `types:packages` (per-package `tsgo` — the honest floor: file-scoped tsc never sees consumers), `types:graph` (the DOM-less root program over `tests/`/`scripts/`), `types:testd` (the vitest `.test-d.ts` typecheck project), `types:tests-dom` (`tsconfig.tests-dom.json` — the home for DOM-coupled NON-`.tsx` tests the root graph excludes), and `types:tests-membership`. **`types:tests-membership` makes a silently un-type-checked test file structurally IMPOSSIBLE** (`tooling/src/verify/ops/tests-type-membership.ts`, landed 2026-07-13): it unions every type program's `tsgo --listFilesOnly` import closure and REDs on any `tests/**`/`playwright/**` TS file that lands in ZERO programs — checked by nothing.
- **`tests:execution-membership`** (`tooling/src/verify/ops/tests-execution-membership.ts`, #22) is the EXECUTION-lane sibling, in the `tests` group not `types`: it makes a silently un-EXECUTED test file structurally impossible, both directions. It asks vitest's + both Playwright configs' own `--list` for their file view (never re-parses glob strings — drift-proof) and REDs on a `tests/**` runner-suffixed file matched by NO view, or a runner view matching ZERO files (the marinara disease: its server `pnpm test` globs matched nothing, silently).
- **`.suite.*` — cross-cutting PROPERTY suites.** Not a new lane (the unit/integration/CT globs collect `.suite.test.ts`/`.suite.int.test.ts`/`.suite.ct.tsx`). The suffix marks a **mirror exemption**: a suite validating ONE property spanning MANY modules (the stats drift gate `drift-gate.suite.int.test.ts`, `solo-byte-identical`, the touch-target floor — the former agent-principal containment matrix died with the 2026-07-25 purge) mirrors no single module. Must still sit under a valid package tree (gate: `test-layout`).
- Client **pure-logic** (`.test.ts`, no DOM) runs in the node unit project and DOES gate — extract DOM-free logic to a function over reaching for a browser (§7).

A file's node lanes sit together at its mirror (`recall.test.ts` beside `recall.int.test.ts`) — never scattered.

## 2. The tree

```
tests/
├── support/            shared substrate (NOT a mirror) — §4
│   ├── fixtures.ts         the composed `test` (test.extend) — import test/expect from HERE
│   ├── db.ts               freshDb (migrated libSQL :memory:)
│   ├── clock.ts            frozen clock + advance() — §3
│   ├── ids.ts              seeded typeid generator — §3
│   ├── matchers.ts         the custom matchers (cap 5) — §4
│   ├── factories/          entity builders (makeX pure + seedX persisted) — §4
│   ├── fixtures/           static fixture data
│   ├── chat/               the scripted provider TAPE + scriptedRunner — §3
│   └── ct/                 Playwright-CT substrate (ct-providers + page.route tRPC stubs) — §7
├── kit/ contracts/ db/ server/ ui/ client/   mirror packages/<pkg>/src 1:1
├── tooling/            tests of root configs + @orb/tooling (mirrors tooling/src/<tool>/ per tool)
└── e2e/                full-stack Playwright .spec.ts (NOT a mirror)
```

`support/` and `e2e/` are unconditional non-mirror trees; **`tooling/` is CONDITIONAL** — `tests/tooling/<dir>/` prefix-swap-mirrors `tooling/src/<dir>/` whenever that tool dir exists, and only flat files plus dirs with no `tooling/src/` twin stay exempt (they test root configs and the research zone). The mirror gate (`tooling/src/verify/gates/test-layout.ts`) enforces exactly that, exempts the `.suite` KINDS (§1 — its `.parity` arm is inert residue of the oracle ripped out by #428), and treats every other path as a strict prefix-swap mirror. The two Playwright configs (`playwright-ct.config.ts`, `playwright.config.ts`) live at the repo root — separate runners, not Vitest projects.

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
| infra/foundation files with runtime logic | a `.test.ts` or `.int.test.ts` (security belts, adapters, dispatchers) |

Exempt by nature: `index.ts` barrels, `context.ts` type-interfaces, pure-type `contract/` files. Browser lanes are not presence-gated.

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

- **Component — Playwright CT** (`@playwright/experimental-ct-react`): `*.ct.tsx` at the mirror, `playwright-ct.config.ts`, `pnpm test:ct`. Mount wraps the component in `CtProviders` (`tests/support/ct/ct-providers.tsx` — the production provider stack: fresh `QueryClient` per mount with `retry:false`, real tRPC over `httpLink`, the real toaster). tRPC is stubbed at the **network** boundary with Playwright `page.route` (the `tests/support/ct/route-trpc.ts` helpers) — **NOT MSW**: CT runs the test in node and the component in the browser, so node-side `vi.fn` closures can't run in the browser worker. Story wrappers (`_ct-stories.tsx`) hold the components CT mounts (CT only mounts from a non-test module).

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
  `rm -rf playwright/.cache && npx playwright test -c playwright-ct.config.ts <paths>`. A CT report with
  ONE suite means the BUNDLE FAILED TO BUILD, not that the named spec failed.

- **`pnpm test` runs the NODE lanes only — it does NOT run CT.** A new/changed shared provider or registry
  Context throws in EVERY story that mounts the component without wrapping it, and `pnpm test` stays GREEN
  while the CT lane is red. Any wave touching a CT-mounted component, a shared provider, or a registry
  Context/Provider MUST run `pnpm test:ct` (or the touched `*.ct.tsx`), not just `pnpm test`.

## 8. Tags (Vitest 4.1+) — the runtime axis, orthogonal to suffix

Sanctioned but not yet wired for the node lanes (no Vitest test needs them yet). Two tags only, added when first needed: `slow` (legitimately >5s, e.g. the real Agent SDK subprocess — long timeout + 1 retry) and `live` (hits real provider APIs, costs money — default-skipped behind `RUN_LIVE=1`). Tags centralize per-category options (`--tag=slow`, `--tag=!live`); suffix stays the KIND axis. They compose: a `.int.test.ts` can be tagged `slow`. The Playwright analogue IS live — `@smoke`/`@live` grep-tags on `.spec.ts`: `pnpm e2e:smoke` gates on `@smoke` at pre-push, and `@live` (real-model specs) is excluded from every gate.

## 9. Mutation testing (Stryker) — the test-quality ratchet

Coverage proves a line *ran*; a **surviving mutant** is a line a test covered but never actually checked — a test that asserts presence-of-behavior without asserting correctness. Two lanes, both on-demand / CI, never in `pnpm check` (runs are minutes):

- `pnpm test:mutation` (`stryker.config.json`) — exploratory, `break:null`; broaden scope via `--mutate`.
- `pnpm test:mutation:gate` (`stryker.gate.config.json`) — the ratchet, pinned to the highest-stakes pure modules (prompt assembly + credential resolution); fails the build below `thresholds.break`. `break` stays `null` until a measured score calibrates it, then ratchets UP as a backslide floor.

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
receipts live in `stryker.config.json`'s `_checkers_comment`.

**An ARID mutant is not a test failure.** `scripts/mutation/arid-ignorer.ts` (a `PluginKind.Ignore` plugin,
wired through `ignorers: ["arid"]` in BOTH configs) drops string-literal mutants whose only destination is an
observability sink — trace recorders, trace-collection appends, trace assignments, trace-carrying payload
objects, logger calls. Those can only ever survive: the "fix" would be a test pinning a debug label
byte-for-byte, i.e. the tautology this doc bans. The predicate is STRUCTURAL — there is no in-source
annotation an author can add to silence their own mutant — and it is bite-proved in BOTH directions by
`tests/tooling/mutation-arid-ignorer.test.ts`. Adding or removing it CHANGES THE DENOMINATOR, so it is part
of the gate's calibration, never a cosmetic.

**The gate's `mutate` list is frozen to its calibrated set; new candidates enter the EXPLORATORY config as
sentinels** (`stryker.config.json` — currently the runtime-string-key and shipped-inversion classes: chat
stats-delta, stats rebuild-from-canon, chat canon-write, chat memory recall). Promoting a sentinel into the
gate requires a fresh calibration run, because `break` is bound to the measured set.

## Esoterica (load-bearing)

- The fixture is the composed *production* wiring with the model scripted — tests exercise the real injection graph, not a parallel test-only assembly. A divergence between test and prod wiring is a bug.
- **`isolate: true` for ALL node projects** (the vitest default, kept deliberately — do NOT set `isolate: false`): a fresh module graph per file resets the single-tenant `globalMacroRegistry` for FREE. Root rigor defaults (`restoreMocks`/`clearMocks`/`unstubGlobals`/`unstubEnvs`/`allowOnly:false`/`requireAssertions`) handle the rest. The parallel `integration` lane is `:memory:`-isolated per test (`freshDb`) so it has zero cross-file state; the `integration-serial` lane (`fileParallelism: false`) holds exactly the files that CAN'T parallelize — tree-writing tooling self-tests that clobber a shared path, fixed-port boots, and heavy full-`createServices` composition files that flaked on the 5s timeout under fork contention (the serial lane gives them 30s). `SERIAL_INT` in `vitest.config.ts` is the pinned list + the rule for adding one. (The 2–3× speedup of `isolate:false` isn't worth the reset-discipline footgun; revisit only if the suite gets slow.)
- Determinism is a *correctness* property: the frozen clock is what makes the rolling-pair breakpoint and memory-recall ordering assertions stable turn-to-turn.
