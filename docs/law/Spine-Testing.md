---
kind: law
status: active
updated: 2026-10-17
---

# Orbweaver — Spine: Testing

Testing policy: mirrored tests, isolated fixtures and production composition. `Core-0-Architecture-and-Structure.md` §5 owns layout. Native runner configs own execution.

## 0. The principle

Tests prove behavior or type contracts. Their filenames declare kind and compiler intent; they do not substitute for assertions. Native compiler, dependency and lint checks enforce their configured boundaries. Other rules remain review guidance. A rule that prevents a known silent regression needs a planted failing control and a valid passing control.

Measurement-budget qualification follows [D308](../adr/0308-hardware-scoped-timing-budgets.md). Use the test-kind capability policy rather than treating shared-hardware timing as a behavioral assertion.

## 1. Test kinds and execution

| Suffix | Compiler world | Executor | Purpose |
| - | - | - | - |
| `.test.ts` | Node | Vitest | Pure behavior and structural assertions |
| `.dom.test.ts` | DOM + Node | Vitest in Node | Browser-subject behavior that needs DOM declarations but no browser execution |
| `.int.test.ts` | Node | Vitest | Real persistence, I/O or composed service behavior |
| `.repo.int.test.ts` | Node | Vitest | Integration behavior that requires the repository resource |
| `.suite.corpus.int.test.ts` | Node | Vitest | Corpus-backed integration behavior with isolated fixtures |
| `.contract.test.ts` | Node | Vitest | Parsing, serialization and wire contracts |
| `.test-d.ts` | Node | Native TypeScript compiler | Type-only contracts |
| `.dom.test-d.ts` | DOM + Node | Native TypeScript compiler | Browser type contracts |
| `.ct.tsx` | DOM + Node | Playwright CT | Rendered component behavior |
| `.spec.ts` | DOM + Node | Playwright E2E | Full-stack behavior |

`.repo.int.test.ts` marks integration tests that use shared repository resources. `.suite.test.ts`, `.suite.int.test.ts` and `.suite.ct.tsx` mark a property spanning multiple source modules. They use the same executor as their family and may sit in any directory of their package tree.

Compiler world follows the contract being checked. Component props, element identities, refs and browser events require real DOM declarations. A successful Node compile alone is insufficient: React provides fallback DOM declarations that can make distinct browser types indistinguishable. Pure logic can remain Node-owned even inside a UI package. Do not classify every test by package directory or maintain per-component exceptions.

Runtime and compiler ownership are separate. A `.dom.test.ts` has DOM declarations but no DOM runtime; code that needs a rendered browser belongs in CT. Test-only helpers live in a test-kit world directory according to their dependency needs. Browser stories and component tests retain the DOM compiler world.

- `pnpm test <paths>` runs named Node tests. `pnpm test` runs the Node suite. `pnpm test:ct <paths>` runs named CTs; no path runs the full CT suite.
- `pnpm e2e:corpus:matrix` runs corpus smoke across authentication modes, chat styles and viewport projects. The runner clones canonical fixtures; Playwright configuration owns the matrix. CI runs one job per project with `pnpm e2e:corpus:matrix --project=<project>`.
- A local run on a copy of owner data never reaches CI. Disable the copy's enabled schedules, because intake refuses them. Write the private fixture with `pnpm exec node scripts/corpus-fixture.ts private <data-dir>`, then run `pnpm exec node scripts/corpus-fixture.ts matrix <fixture-dir>`. Run both in a loopback-only network and PID namespace; the private runner refuses any other network.
- `pnpm typecheck` runs the native compiler over checked-in TypeScript projects, including `.test-d.ts` assertions.
- Vitest and Playwright configs own collection and execution. Do not copy their file globs into another runner.
- Integration fixtures default to isolated resources and parallel execution under the shared capacity profile. Scheduling restrictions require a current resource or measurement reason; historical slowness does not establish serialization.

## 2. The tree

```text
tests/
├── support/                    the @orb/testkit package; no source mirror
│   ├── iso/                    platform-independent seams: frozen clock, seeded ids
│   ├── node/                   fixtures.ts and tool-fixtures.ts, factories/, the chat tape, db and Node drivers
│   └── browser/                browser helpers, the CT door and providers
├── <package>/                  mirror packages/<package>/src directories for registered workspaces
├── tooling/                    mirror tooling/src directories where a tool home exists
└── e2e/                        full-stack Playwright tests
```

A test lives in the directory that mirrors the source directory it covers, and its file name says the behaviour it proves. One file may cover several modules of its directory; prefer one feature suite over a thin file per module. `support/` and `e2e/` mirror nothing. A tooling test sits in its tool's mirrored directory when that tool exists; flat config tests and research subjects without a tool directory retain their documented exemption. D333 retires custom layout and presence enforcement.

The sibling legacy source at /home/inktomi/inktomi-stack/development/orbweaver-legacy-tests-2026-10-21 is reference-only. It is not compiled or run by this repository. Use it to identify meaningful cases for rebuilt tests.

`support/` is the test kit, the workspace package `@orb/testkit`. A test imports it through a world subpath, such as `@orb/testkit/node/fixtures.ts`; the kit has no root entry, and its files import each other by relative path. Every kit module lives in exactly one world directory: `iso/` needs neither Node nor DOM declarations, `node/` may use Node and the runners, and `browser/` holds browser and CT helpers.  `Core-0-Architecture-and-Structure.md` §5 owns the kit's doors and the two named exceptions.

`tests/support/node/server.ts` owns the server test composition root and delegates to production composition. Rebuilt server cases use this graph or call pure production functions directly. Builders use deterministic defaults or actual production operations. External-edge adapters and recorders belong in the kit; copied domain rules and alternate domain assemblies do not.

## 3. Determinism + mock doctrine

**Determinism — no wall-clock, no randomness in a test or factory.** The frozen clock is a plain injected DI object (`support/iso/clock.ts`: `createFrozenClock(startMs?)` returns `{ now, advance, frozenAt }` — `now()` reads a mutable counter, `advance(ms)` moves it, `frozenAt` is the fixed start; `FROZEN_AT_MS` is the shared epoch every factory stamps rows from). It is NOT global-timer interception — there is no Luxon `Settings.now`, no `vi.useFakeTimers`; the composition root takes `now` as a dep exactly like production (`docs/law/Tier-5-Entry.md`), so tests exercise the real injection seam rather than a monkey-patched global. Seeded ids come the same way (`support/iso/ids.ts`, counter-backed). Do not use ambient `Date.now()`, `Math.random()` or unseeded `typeid()` in tests. A test needing time to move calls `advance()`, never a real timer. A test whose subject is a real `setTimeout` window that no injected clock can drive may use `vi.useFakeTimers`. Drive other timer bounds through an injected timer seam and trigger it directly in tests.

**Non-vacuity control — prove the guard path FIRES before trusting a negative assert.** A test whose whole point is "X is refused / dropped / blocked" is worthless if the setup silently never reached the guard — the negative assertion passes vacuously. The pattern: a POSITIVE control in the same test (or its sibling) that drives the guarded path to its allowed outcome under the same wiring, so a mis-wired fixture fails the control instead of green-washing the refusal. Exemplars: `db-batch-atomicity.suite` (proves the batch COMMITS before proving a mid-batch failure rolls the whole thing back) and `touch-target-floor.suite` (proves a compliant target PASSES before asserting an undersized one is flagged). Reach for a control whenever the assertion is an absence.

**Mock doctrine — fake at the edges, inject at the root, never mock an internal module.**

- **DB:** real libSQL `:memory:` for `.int` (`freshDb`). Never mocked — the point of the cake is that persistence is real, cheap, in-process.
- **External execution:** script raw provider transport, SDK subprocess protocol, plugin-host or network inputs through the production root's execution seams. Keep native parsing, admission, funding, accounting and domain orchestration in production. A fake `RunChatTurnOp`, role client, Query or domain service does not replace these paths in rebuilt tests. Exhausted scripts refuse instead of cycling into a fabricated success.
- **Cross-feature dependencies:** wire actual production owners through the root. Inject only external edges, not a copied rule or a fake collaborator that stands in for business behavior. Never mock an internal module.

For signed external-protocol test inputs, use native timestamp defaults and verification under [D319](../adr/0319-native-protocol-time-in-scripted-test-edges.md). Business clocks, IDs and helper reads retain the determinism rule above.

Injected clocks model product time. External process, socket and browser completion require their actual lifecycle signals; a frozen clock does not establish physical completion.

Do not use `vi.mock` or `vi.spyOn` on an internal module namespace: they replace behavior for every importer. A spy on an object the composition root hands over stays legal.

## 4. The fixture + factory contract

**Fixture doctrine:** composed `test.extend`, never `beforeEach` sprinkled per file. `tests/support/node/fixtures.ts` exports the project `test` (typed, lazily-initialized — a fixture only runs if destructured); import `{ test, expect }` from there, never raw fixture modules. Fixtures grow as needs land (clock + ids today; a scoped `db` and caller fixtures join the same composed `test`, not per-file setup).

**Custom matchers (cap at 5):** each must appear in ≥10 sites or encode a domain invariant whose diff message beats a generic `toEqual`. No generic equality/impl-detail/framework wrappers. (Root config already enforces `expect.requireAssertions` — no assertion-free tests.)

**Factory contract** (every `support/node/factories/*.ts`):

- Pure builders derive valid deterministic defaults from canonical types and schemas. They use seeded ids and the frozen clock, never database or external I/O.
- Production-backed producers accept the nominal `ServerProducerRoot` from the real harness, not caller-supplied business callbacks. They call its production operations and capture canonical rows and outputs.
- Database-subject fixtures may construct valid rows from derived defaults and insert them directly. These fixtures do not replace production behavior in composed domain cases.
- Overrides preserve valid relations and schema constraints. Factories live in `support/node/factories/`; private corpus orchestration calls those homes.

## 5. The presence rule — what MUST have a test

The checklist below names product surfaces that need behavioral tests. D333 retires custom presence gates; no module is automatically checked for test reach. There is no blanket per-file coverage; it breeds assertion-free filler.

Prefer tests that import and call the production behavior they exercise. A type-only import or a mock of the subject does not exercise runtime behavior.

| Surface | Reached by |
| - | - |
| every `domain/<f>/verbs/*.ts` | a unit or integration test (the verb IS the behavior) |
| every tRPC router — an exported `router({…})` binding under `transport/` | a unit or integration test |
| every `persistence/*.ts` | an integration test against `freshDb` (queries are only "correct" against a real db) |
| every domain `contract/*.ts` and every `@orb/contracts` file declaring a zod schema | a contract test (parse + round-trip) |
| **every OTHER `domain/**` file with runtime logic** — `substrate/`, a named subsystem (`engine/`, `assembly/`, `memory/`, `themes/`…), `guard.ts`, a sanctioned feature-root singleton, a `contract/` file carrying real logic | a unit or integration test |
| infra/foundation files with runtime logic | a unit or integration test (security checks, adapters, dispatchers) |
| **every `entry/**` + `transport/**` file with runtime logic** — a boot step, a composition seam, an HTTP registrar, a job driver, a bus, a ladder primitive | a unit or integration test |
| every `@orb/inference` module with an emitted export | a unit, integration or contract test |
| every direct child of the client `data/`, `forms/`, `forms/editor/` and `state/` homes with a callable export | a unit or component test |
| every non-primitive `@orb/ui` logic module (`charts/`, `markdown/`, `stream/`, `content/`, `code-editor/`, `diff/`, `fuzzy-search/`) with a callable export | a unit or component test |
| every action a client `state/` file exports when it mints a store (a `use*` read-hook is not an action) | a unit or component test that calls it |

Each behavior surface should have tests for its contract and important failure paths. A test for a state action asserts the resulting state, including every channel a dual-write changes.

Coverage remains report-only. A coverage number does not prove that a test asserts correct behavior.

## 6. The "what to test" obligations, gathered

- **The "preserve exactly" esoterica** — each critical behavior becomes a named test at its mirror. Headliners: the GCM AAD byte-string `${userId}|${provider}`, the ZWSP in `neutralizeMacros`, the PNG dual-chunk + CRC, the vLLM death-couple pipe-watchdog, `storedVersion`-beats-probe, the last-owner / owner-immutability guard (D17), `deepMergeRequestBody` Layer-2 defense, every `ASSUMES(single-replica)`.
- There is no differential oracle. Nothing on the tree is measured against neo.
- **Memory's chat-scoped semantics** — a "could silently regress" surface the oracle never covered either (memory is a rewrite, not a port). Each → a named `.int.test.ts` at the memory mirror.
- **Serde round-trip** — import → export → reimport hash-identical, a `.contract.test` invariant on the one serde core (`docs/law/Spine-Config-and-Serialization.md` §7.3).

## 7. Client / browser tests — Playwright, NOT Vitest browser

Vitest browser-mode is FORBIDDEN — cold-cache dep-discovery *hangs*. Use Playwright CT and E2E:

- **Component — Playwright CT** (`@playwright/experimental-ct-react`): `*.ct.tsx` at the mirror, `playwright-ct.config.ts`, `pnpm test:ct`. `CtProviders` supplies UI-only chrome. Client component mounts use `CtClientProviders` from `tests/support/browser/ct-data-providers.tsx`: production data defaults, registry factories, provider order and notification mapping. Each mount retains its runtime until teardown. Primitive isolation uses the named `CtIsolation` exception; registry variants use `isolationRegistry`. Stub tRPC at the **network** boundary with Playwright `page.route`, never by replacing client modules. Node-side closures cannot execute inside the browser worker. Story wrappers hold the components CT mounts.

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

- **The maintained client door uses the production error channel.** Mutation-error notifications are observable through its real toaster. Timing overrides belong to explicit data-isolation helpers, not another cache implementation.

- **Declare every intercepted request.** `routeTrpc` fails the native Playwright test for an unlisted procedure, even when the component handles the transport failure. Script errors and terminal subscriptions explicitly.

- **`page.addInitScript` does not affect the CURRENT page** (the `page` fixture has already navigated) —
  it fires on SUBSEQUENT navigations, so for pre-module-init state (persisted stores, localStorage seeds)
  use `page.addInitScript` + `page.reload()` to re-run the page with the script installed. For
  instrumentation that only needs to run before `mount()`, use `page.evaluate` BEFORE `mount()` instead.

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
  value); avoid `page.waitForTimeout`. And barrier on a SETTLED rendered state — a node-side
  request count is not a browser-side settle.

- **A stub at the seam under test is a tautology.** A fixed-array responder passes every FILTER test while
  the filter is wrong: a CT proving server-side filtering uses an INPUT-AWARE responder (it filters/sorts by
  the request it received) so filtering that ignores its input goes red. Whatever a CT fakes, something else
  (an `.int` test through the real verb, or a live drive) owns that seam's truth.

- **A source-neuter "bite proof" lies for a bare `@orb/*` import** — vite's `optimizeDeps` serves a
  PREBUNDLED copy that clearing `playwright/.cache` does not invalidate. Relative-path (`_*-stories`)
  imports compile fresh; for bare-import wiring tests, prove the bite with in-test rendered pre/post
  controls.

- **Lane invocation**: `pnpm test:ct <paths>`. The supervisor owns run/cache coordination and build identity. A CT report with
  ONE suite means the BUNDLE FAILED TO BUILD, not that the named spec failed.

- **`pnpm test` does not run CT.** A shared provider or registry Context change can break rendered
  stories while Node tests remain green. Such changes require the relevant `pnpm test:ct` coverage;
  run `pnpm test:ct` for the full CT suite.

## 8. Tags (Vitest 4.1+) — the runtime axis, orthogonal to suffix

`tooling/src/floor/testing/test-tags.ts` owns the registered Vitest tag names and options. The runtime uses `strictTags: true`; the test-only ambient augmentation derives the same closed name union for TypeScript. Register a tag when a real test needs it, rather than reserving hypothetical categories. The `slow` tag preserves a 30-second timeout without adding retries. Select tagged cases through native `--tagsFilter=slow` or a negated expression.

Tags describe cross-cutting test requirements; suffixes retain test kind and compiler-world meaning. Tags filter callbacks after module import, so they cannot isolate import-time side effects or supply repository/process capabilities missing from the runner.

Playwright uses its own `@smoke`/`@live` tags: `pnpm e2e:smoke` selects smoke cases, while real-provider cases remain opt-in through its live entry point. The shared `E2E_LIVE` spelling expresses operator intent; each runner retains its native selection mechanism.

## 9. Tests run the product

A test proves what ships. Helpers, stories and fixtures must follow a product change without edits.

This section governs product tests, including the shared builders under `tests/support`. Tests for retained application-development tools belong in their tool mirrors.

- **Call production; never copy it.** A harness, fixture or story calls the production function, query, predicate, reducer or default. If the rule is private to a compose closure or a `.tsx` file, export it or move it to `@orb/contracts` or `@orb/kit` first. A test-side copy of production logic is a defect.
- **Derive types.** Take wire and row shapes from the contract, `inferOutput`, `TrpcInput`, `TrpcWireOutput` or the `AppRouter` type. Never hand-declare a shape production owns. Cast only to feed a refusal path bad input, with the reason beside the cast.
- **Import constants.** Labels, ids, defaults, limits, tokens, timings and contrast floors come from their production home. If a CT cannot import a `.tsx` value, move the value to a zero-import `.ts` module.
- **Seed through real builders.** Write rows through the production verb or a factory in `tests/support/node/factories`. Never mint a state production cannot produce.
- **Mount the real door.** CT harnesses call production registry factories and mount their actual provider stack. Equal copied lists are not the production door. Stories mount the real surface and stub only the network edge. Browser-world stories, fixtures and support cannot value-import server implementation; native dependency-cruiser owns that boundary and preserves the type-only bridge.
- **Snapshot the product.** Build an aria or text snapshot from what production renders, never from a hand-listed roster.
- **Smoke the running app.** e2e specs drive the real stack headless for the core flows. They run on a committed synthetic corpus written by the seed tool, so CI needs no private data. A local run may point at a copy of the owner's data; that copy is never committed.
- **Share setup.** Move repeated setup to a builder in the same file or in `tests/support`. Split a test file by concern before it is too large to review. ESLint `max-lines` in `eslint.config.js` caps maintained test files.
- **A mirror is an import, not a filename.** A mirrored test imports its module and exercises its exports. A file at the mirrored path proves only that the file exists.

## Esoterica (must-preserve facts)

- The fixture is the composed *production* wiring with the model scripted — tests exercise the real injection graph, not a parallel test-only assembly. A divergence between test and prod wiring is a bug.
- **`isolate: true` for all Node projects** (the Vitest default): each test file receives a fresh module graph. Root mock/global/environment cleanup remains inherited by every project. Database integration fixtures own their in-memory databases; resource isolation is what makes parallel execution correct.
- **Timeout scaling and measurement validity differ.** `scaledBudget` stretches completion deadlines. `labelRateLoad` flags a measured test as `load-suspect` when contention prevents judging its threshold; the measurement still runs and its number remains available. The supervisor surfaces the task metadata. A wider deadline cannot make a dropped-frame percentage valid, and a browser dependency alone does not make an assertion a measured-rate test.
- Determinism is a *correctness* property: the frozen clock is what makes the rolling-pair breakpoint and memory-recall ordering assertions stable turn-to-turn.
