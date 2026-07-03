---
kind: law
status: active
updated: 2026-07-03
---

# Orbweaver — Spine: Testing (one centralized tree, suffix-selected lanes, Playwright for browser)

Canonical doc for the testing thread every domain doc defers to (`→ test-time` notes). BUILT — current law. The *layout* is locked in `core/Core-0-Architecture-and-Structure.md §5` (one central `tests/` tree mirroring `src/` 1:1 + the `test-layout` gate); this doc is the *policy*: lanes, presence rule, mock/determinism doctrine, factory contract, tags, coverage, mutation.
**Design choice (intentional, vs neo-tavern):** ONE centralized `tests/` tree, test KIND by **filename suffix** (a lane = a glob/`--project` filter), not neo's category-directory split. Taken from neo's proven doctrine: browser tests run on **Playwright, never Vitest browser-mode** (§7).

## 0. The principle

The test path is a derivation (prefix-swap mirror), the kind is a suffix, gates force both: `test-layout` (mirror), `test-presence` (§5), `test-determinism` (§3), `test-fixture-imports`/`test-factory-contract` (§4), `test-mock-doctrine` (§3) — all in `scripts/check/gates/`.

## 1. The lanes

Node lanes are `test.projects` in the ONE `vitest.config.ts`, selected by suffix (`test.projects` IS the modern "workspace" — `vitest.workspace.ts` was deprecated in Vitest 3.2). Browser lanes are separate Playwright runners with their own configs.

| Suffix | Lane | Runner | Touches | Gates at |
| - | - | - | - | - |
| `.test.ts` | unit | Vitest (node) | nothing — pure logic, kit primitives, dispatch, SHAPE | pre-push (`pnpm test`) |
| `.int.test.ts` | integration | Vitest (node, serial) | real libSQL `:memory:` (`freshDb`) | pre-push (`pnpm test`) |
| `.contract.test.ts` | golden / surface | Vitest (node) | a stable *shape* — zod round-trip, serde, wire body | pre-push (`pnpm test`) |
| `.test-d.ts` | types | Vitest typecheck project | `tsc` only — `expectTypeOf` over branded/union contracts | pre-commit (`pnpm check` → `test:types`) |
| `.parity.test.ts` | differential oracle | Vitest (opt-in project) | the steady clone + a fixture db | on-demand (`pnpm test:parity`) |
| `.ct.tsx` | component | Playwright CT | a real browser; one component | on-demand (`pnpm test:ct`) |
| `.spec.ts` | e2e | Playwright | the full running stack | on-demand (`pnpm e2e`) |

- The commit/push split (`lefthook.yml`): pre-commit runs `pnpm check` (lint + `tsc` + the types lane + structure gates + dep-cruiser, \~30s); pre-push additionally runs `pnpm test` (unit + integration + contract, minutes). Behavioral tests are deliberately NOT in `pnpm check`.
- **`.parity` is opt-in**: it stands up an external process (the steady clone) and is slow. The honest caveat travels with the lane: **the oracle validates parity, never memory** — memory is an intentional rewrite and gets `.int` behavioral tests (§6), not a diff.
- **`.suite.test.ts` / `.suite.int.test.ts` — cross-cutting PROPERTY suites (sanctioned 2026-07-02).** Not a new lane (the unit/integration globs collect them). The suffix marks a **mirror exemption**: a suite validating ONE property spanning MANY modules (the stats live-vs-reconcile drift gate, the agent-principal containment matrix) mirrors no single module — the same exemption category as `.parity`. Must still sit under a valid package tree (gate: `test-layout`).
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
│   ├── factories/          entity builders (makeX pure + seedX persisted) — §4
│   ├── fixtures/           static fixture data (parity cases, …)
│   ├── ct/                 Playwright-CT substrate (ct-providers.tsx) — §7
│   └── parity-runner.ts    drives the steady clone — §6
├── kit/ contracts/ db/ server/ ui/ client/   mirror packages/<pkg>/src 1:1
├── tooling/            tests of root configs + the scripts/check gates (NOT a mirror)
└── e2e/                full-stack Playwright .spec.ts (NOT a mirror)
```

`support/`, `e2e/`, `tooling/` are the three non-mirror trees; the mirror gate (`scripts/check/gates/test-layout.ts`) exempts exactly those, exempts the `.parity`/`.suite` KINDS (§1), and treats every other path as a strict prefix-swap mirror. The two Playwright configs (`playwright-ct.config.ts`, `playwright.config.ts`) live at the repo root — separate runners, not Vitest projects.

## 3. Determinism + mock doctrine

**Determinism — no wall-clock, no randomness in a test or factory.** The fixture injects the frozen clock (`support/clock.ts`; Luxon `Settings.now` + `vi.useFakeTimers` with a `toFake` allowlist that does NOT fake `queueMicrotask`) and seeded ids (`support/ids.ts`, counter-backed typeid); the composition root accepts both as injected deps (the same seam `core/Tier-5-Entry.md` defines for production). Ambient `Date.now()`/`Math.random()`/unseeded `typeid()` under `tests/` is RED (gate: `test-determinism`).

**Mock doctrine — fake at the edges, inject at the root, never mock an internal module.**

- **DB:** real libSQL `:memory:` for `.int` (`freshDb`). Never mocked — the point of the cake is that persistence is real, cheap, in-process.
- **The model / provider HTTP:** the only true external I/O — scripted via the `scripted-override` runner fixture (`infra/providers/scripted-override.ts`, Vercel-AI-SDK `MockLanguageModelV3` chunk shape). Provider request *shape* is pinned by `.contract` tests; provider *behavior* is scripted.
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

`test-layout` enforces *where*; `test-presence` (`scripts/check/gates/`) enforces *that*, on exactly the surfaces where an untested change silently breaks behavior — no blanket per-file coverage (that breeds assertion-free filler):

| Surface | Required test |
| - | - |
| every `domain/<f>/verbs/*.ts` | ≥1 `.test.ts` or `.int.test.ts` at its mirror (the verb IS the behavior; the service façade is covered transitively) |
| every `contract/*.ts` exporting a zod schema | a `.contract.test.ts` (parse + round-trip) |
| every `persistence/*.ts` | a `.int.test.ts` against `freshDb` (queries are only "correct" against a real db) |
| infra/foundation files with runtime logic | a `.test.ts` or `.int.test.ts` (security belts, adapters, dispatchers) |

Exempt by nature: `index.ts` barrels, `context.ts` type-interfaces, pure-type `contract/` files. Browser lanes are not presence-gated.

**Coverage: REPORT-ONLY.** v8 provider, `pnpm test:coverage`, NEVER inside `pnpm check`; no `thresholds` block until a real baseline exists — then pin GLOBAL thresholds and ratchet UP as a backslide floor. For "do these tests catch bugs?" use mutation testing (§9), not a coverage number.

## 6. The "what to test" obligations, gathered

- **The \~150 "preserve exactly" esoterica** (`Core-Planning-and-Checklists.md §C2`) — each load-bearing behavior becomes a named test at its mirror. Headliners: the GCM AAD byte-string `${userId}|${provider}`, the ZWSP in `neutralizeMacros`, the PNG dual-chunk + CRC, the vLLM death-couple pipe-watchdog, `storedVersion`-beats-probe, the last-owner / owner-immutability guard (D17), `deepMergeRequestBody` Layer-2 defense, every `ASSUMES(single-replica)`.
- **The differential oracle** (`Core-Planning-and-Checklists.md §C1`) — `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts` + driver `tests/support/parity-runner.ts`: rolling-pair breakpoint + cache-token delta diff vs the steady clone. Pins parity only.
- **Memory's chat-scoped semantics** — the "could silently regress" surface the oracle *cannot* cover (memory is a rewrite, not a port). Each → a named `.int.test.ts` at the memory mirror. The one place "we have tests" and "we can prove parity" deliberately diverge.
- **Serde round-trip** — import → export → reimport hash-identical, a `.contract.test` invariant on the one serde core (`core/Spine-Config-and-Serialization.md` §7.3).

## 7. Client / browser tests — Playwright, NOT Vitest browser

Vitest browser-mode is FORBIDDEN — cold-cache dep-discovery *hangs* (neo-tavern hit this and migrated off it, 2026-06-20). Two Playwright lanes, neither in `pnpm check`:

- **Component — Playwright CT** (`@playwright/experimental-ct-react`): `*.ct.tsx` at the mirror, `playwright-ct.config.ts`, `pnpm test:ct`. Mount wraps the component in `CtProviders` (`tests/support/ct/ct-providers.tsx` — the production provider stack: fresh `QueryClient` per mount with `retry:false`, real tRPC over `httpLink`, the real toaster). tRPC is stubbed at the **network** boundary with Playwright `page.route` — **NOT MSW**: CT runs the test in node and the component in the browser, so node-side `vi.fn` closures can't run in the browser worker. Story wrappers (`_ct-stories.tsx`) hold the components CT mounts (CT only mounts from a non-test module).
- **e2e** — `*.spec.ts` under `tests/e2e/`, `playwright.config.ts`, `pnpm e2e`: the full running stack.
- **Locator priority:** `getByRole` ≫ `getByLabel` ≫ `getByPlaceholder` ≫ `getByText` ≫ … ≫ `getByTestId` (last resort, never for buttons/inputs). **Real timers in form tests** (fake timers drift against React 19's scheduler + debounce — assert with Playwright's auto-retrying `expect`).

## 8. Tags (Vitest 4.1+) — the runtime axis, orthogonal to suffix

Sanctioned but not yet wired (no test needs them yet). Two tags only, added when first needed: `slow` (legitimately >5s, e.g. the real Agent SDK subprocess — long timeout + 1 retry) and `live` (hits real provider APIs, costs money — default-skipped behind `RUN_LIVE=1`). Tags centralize per-category options (`--tag=slow`, `--tag=!live`); suffix stays the KIND axis. They compose: a `.int.test.ts` can be tagged `slow`.

## 9. Mutation testing (Stryker) — the test-quality ratchet

Coverage proves a line *ran*; a **surviving mutant** is a line a test covered but never actually checked (neo's founding `isVllmBackend`-lying-gate class). Two lanes, both on-demand / CI, never in `pnpm check` (runs are minutes):

- `pnpm test:mutation` (`stryker.config.json`) — exploratory, `break:null`; broaden scope via `--mutate`.
- `pnpm test:mutation:gate` (`stryker.gate.config.json`) — the ratchet, pinned to the highest-stakes pure modules; fails the build below `thresholds.break`. `break` stays `null` until a measured score calibrates it, then ratchets UP (neo: aggregate 55%→66% over one hardening pass, break held \~6pts under).

Both run the node lanes via the `vitest` runner (`vitest.stryker.config.ts`) + the `typescript` checker.

## Esoterica (load-bearing)

- The fixture is the composed *production* wiring with the model scripted — tests exercise the real injection graph, not a parallel test-only assembly. A divergence between test and prod wiring is a bug.
- **`isolate: true` for ALL node projects** (the vitest default, kept deliberately — NOT neo's `isolate: false`): a fresh module graph per file resets the single-tenant `globalMacroRegistry` for FREE. Root rigor defaults (`restoreMocks`/`clearMocks`/`unstubGlobals`/`unstubEnvs`/`allowOnly:false`/`requireAssertions`) handle the rest. `integration` additionally runs serially (`fileParallelism: false`) — the tree-mutating gate self-tests need exclusivity; `freshDb` isolates data. (The 2–3× speedup of `isolate:false` isn't worth the reset-discipline footgun; revisit only if the suite gets slow.)
- **`.parity` is excluded** from the default run on purpose — run before chat/memory changes and in the nightly, never the inner loop.
- Determinism is a *correctness* property: the frozen clock is what makes the rolling-pair breakpoint and memory-recall ordering assertions stable turn-to-turn.
