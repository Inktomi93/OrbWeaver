# Spine-Testing

> Auto-generated spine pillar.

## Table of Contents

- [Orbweaver — `testing`: one centralized tree, suffix-selected lanes, Playwright for browser](#a5de2a4e)
  - [0. The principle — the test path is a derivation, the kind is a suffix, a gate forces both](#acdf0926)
  - [1. The lanes — one centralized Vitest config (projects by suffix) + Playwright for browser](#858cecd4)
  - [2. The tree (one centralized `tests/` mirroring `src/`; `support/` + `e2e/` are the only non-mirror trees)](#476d26ec)
  - [3. Determinism + mock doctrine (the two rules that keep tests honest)](#ffaa00e3)
  - [4. The fixture + factory contract (so `tests/support/` is buildable day-one)](#7ef4212b)
  - [5. The presence rule — what MUST have a test (the `test-presence` gate)](#e4a27ed2)
  - [6. The "what to test" obligations, gathered (the part that was scattered)](#020430a4)
  - [7. Client / browser tests — Playwright, NOT Vitest browser](#040f6648)
  - [8. Tags (Vitest 4.1+) — the runtime axis, orthogonal to suffix](#d0ff9b60)
  - [9. Mutation testing (Stryker) — the test-quality ratchet — SCHEDULED (Phase 4c/5)](#1b78636d)
  - [Invariants (gate candidates)](#cae558c7)
  - [Esoteric / load-bearing](#77111b41)

---

<!-- Source: Spine-Testing.md -->

<a id='a5de2a4e'></a>

## Orbweaver — `testing`: one centralized tree, suffix-selected lanes, Playwright for browser

> **Status: planning (authoritative detail).** Testing is the cross-cutting thread that every domain doc
> defers to with a bare `→ test-time` enforcer note and a `## Esoteric / load-bearing` list. The _layout_
> is locked in `core/Core-0-Architecture-and-Structure.md §5` (one central `tests/` tree mirroring `src/` 1:1 + the `test-mirror`
> gate); this doc adds the _policy_ — the lanes, the presence rule, mock/determinism, the factory
> contract, tags, coverage, and the homes for the oracle + esoterica + memory semantics.
> **Design choice (intentional, vs neo-tavern):** orbweaver keeps ONE centralized `tests/` tree and
> distinguishes test KIND by **filename suffix** (a lane = a glob/`--project` filter), rather than
> neo-tavern's category-directory split. Suffixes are more CI-flexible (run/exclude any lane without
> directory gymnastics) and fit the package cake. What we DID take from neo's proven doctrine: **browser
> tests run on Playwright, never Vitest browser-mode** (§7), plus tags, the coverage floor, and the
> fixture/clock/runner patterns. Decisions committed in `core/Core-Laws-and-Precedents.md §6`.

<!-- Source: Spine-Testing.md -->

<a id='acdf0926'></a>

### 0. The principle — the test path is a derivation, the kind is a suffix, a gate forces both

`core/Core-0-Architecture-and-Structure.md §5` locks the load-bearing 80%: one central `tests/` tree mirroring `src/` 1:1 (prefix-swap
path), kind-by-suffix, the composed `test.extend` fixture doctrine, and the `test-mirror` gate that turns
`check` red if a test doesn't land at its computed path. This doc adds the missing 20%: **the lanes, the
presence rule (what MUST have a test), the mock/determinism doctrine, the factory contract, tags, coverage,
and the homes for the oracle + esoterica + memory semantics** — each with its enforcer, because a
prose-only test policy is not a policy.

<!-- Source: Spine-Testing.md -->

<a id='858cecd4'></a>

### 1. The lanes — one centralized Vitest config (projects by suffix) + Playwright for browser

Kind is a **filename suffix**, not a directory — so a lane is a glob/`--project` filter and CI can run or
exclude any kind without directory gymnastics. The **node** lanes all live in ONE centralized
`vitest.config.ts` as `test.projects` selected by suffix. (`test.projects` IS the modern "workspace" — the
standalone `vitest.workspace.ts` was deprecated in Vitest 3.2; a project is a workspace member, so
"projects" and "workspaces" are the same feature, not alternatives.) The **browser** lanes are
**Playwright, NOT Vitest** — Vitest browser-mode is out: it cold-cache dep-discovery _hangs_ (neo-tavern
hit exactly this and migrated off it). They are separate runners with their own configs.

| Suffix              | Lane                    | Runner                   | Touches                                                                     | In fast `check`? |
| ------------------- | ----------------------- | ------------------------ | --------------------------------------------------------------------------- | ---------------- |
| `.test.ts`          | **unit**                | Vitest (node)            | nothing — pure logic, kit primitives, builders, dispatch, SHAPE             | ✅               |
| `.int.test.ts`      | **integration**         | Vitest (node)            | a real libSQL `:memory:` db (`freshDb`)                                     | ✅               |
| `.contract.test.ts` | **golden / surface**    | Vitest (node)            | a stable _shape_ — `z.object` round-trip, serde, wire body, schema snapshot | ✅               |
| `.test-d.ts`        | **types**               | Vitest typecheck project | `tsc` only — `expectTypeOf`/`assertType` over branded/union contracts       | ✅               |
| `.parity.test.ts`   | **differential oracle** | Vitest (opt-in project)  | the steady clone + a fixture db                                             | ❌ on-demand     |
| `.ct.tsx`           | **component**           | **Playwright CT**        | a real browser; one component + `CtProviders`                               | ❌ own lane      |
| `.spec.ts`          | **e2e**                 | **Playwright**           | the full running stack                                                      | ❌ own lane      |

- **Node lanes** are `test.projects` in one config, selected by suffix: `unit` (`.test`), `integration`
  (`.int.test`, db setup + `isolate:true`), `contract` (`.contract.test`), `types` (`.test-d.ts`,
  `typecheck.only`), `parity` (`.parity.test`, opt-in). CI runs lanes by name
  (`vitest --project integration`) or excludes the slow one (`--project '!parity'`). `pnpm check` runs
  unit + integration + contract + types; `pnpm test:parity` is the deliberate, pre-chat-scaffold gate.
- **`.parity` is opt-in** because it stands up an external process (the steady clone), is slow, and must
  be excludable from the inner loop + the fast CI lane. The honest caveat travels with the lane: **the
  oracle validates parity, never memory** — memory is an intentional rewrite and gets `.int` behavioral
  tests (§5), not a diff.
- **Browser lanes are NOT in `pnpm check`** (no fast-gate browser — same reason e2e isn't): run
  `pnpm test:ct` / `pnpm e2e` on demand. Client **pure-logic** (`.test.ts`, no DOM) runs in the node
  `unit` project and DOES gate — extract DOM-free logic to a function and node-test it over reaching for a
  browser. (§7.)

A file's node lanes sit **together** at its mirror (e.g. `tests/server/domain/chat/memory/recall.test.ts`

- `recall.int.test.ts`) — never scattered.

<!-- Source: Spine-Testing.md -->

<a id='476d26ec'></a>

### 2. The tree (one centralized `tests/` mirroring `src/`; `support/` + `e2e/` are the only non-mirror trees)

```
tests/
├── support/          shared test substrate (NOT a mirror) — §4
│   ├── test.ts           the composed `test` (test.extend → db, clock, ids, callers, scriptedRunner)
│   ├── factories/        entity builders (makeX pure + seedX persisted) — §4 contract
│   ├── db.ts             freshDb / seed helpers (libSQL :memory:)
│   ├── clock.ts          frozen clock + advance() — determinism (§3)
│   ├── ids.ts            seeded typeid generator — deterministic ids (§3)
│   ├── ct-providers.tsx  the Playwright-CT provider stack (§7)
│   ├── route-trpc.ts     Playwright page.route tRPC interceptor (§7 — NOT MSW)
│   └── parity-runner.ts  drives the steady clone, captures SEND/ASSEMBLE/RECEIVE (§6)
├── kit/              mirrors packages/kit/src/        (.test.ts · .test-d.ts)
├── contracts/        mirrors packages/contracts/src/  (.contract.test.ts · .test-d.ts)
├── db/               mirrors packages/db/src/         (.int.test.ts)
├── server/           mirrors packages/server/src/     (all node suffixes; .parity.test.ts at the validated module)
├── client/           mirrors features/                (.ct.tsx = Playwright CT · .test.ts = node pure-logic)
└── e2e/              full-stack Playwright .spec.ts    (NOT a mirror — spans the whole app)
```

`support/` (fixtures + harnesses) and `e2e/` (whole-app `.spec.ts`) are the only non-mirror trees; the
`test-mirror` gate exempts exactly these two and treats every other path as a strict prefix-swap mirror.
The two Playwright configs (`playwright-ct.config.ts`, `playwright.config.ts`) live at the repo root /
`.config/` — they are **separate runners**, not part of the Vitest config.

<!-- Source: Spine-Testing.md -->

<a id='ffaa00e3'></a>

### 3. Determinism + mock doctrine (the two rules that keep tests honest)

**Determinism — no wall-clock, no randomness in a test or a factory.** The fixture injects a **frozen
clock** (`tests/support/clock.ts`, `advance(ms)` to move it — Luxon `Settings.now` + `vi.useFakeTimers`
with a `toFake` allowlist that does NOT fake `queueMicrotask`) and a **seeded id generator**
(`tests/support/ids.ts` — a counter-backed `typeid`), and the composition root accepts both as injected
deps (the same injection seam `core/Tier-5-Entry.md` defines for production). A test that reaches for
`Date.now()` / `Math.random()` / `new Date()` / `typeid()`-unseeded is non-reproducible and is a gate
candidate (`test-determinism`, biome no-restricted-globals scoped to `tests/`).

**Mock doctrine — fake at the edges, inject at the root, never mock an internal module.**

- **DB:** use a **real libSQL `:memory:`** db for `.int` (the fixture's `freshDb`). We do not mock the db
  — the whole point of the cake is that persistence is real, cheap, and in-process.
- **The model / provider HTTP:** the only true external I/O. Make it deterministic via the existing
  **scripted-runner** fixture (`RUNNER_OVERRIDE` / `scripted-override.ts`), modeled on the Vercel AI SDK
  `MockLanguageModelV3` chunk shape — script the response. Provider request _shape_ is pinned by a
  `.contract` test; provider _behavior_ is scripted.
- **Cross-feature deps:** inject a fake at the composition root (the §-`entry` injection model), never
  `vi.mock()` a sibling module. If a test needs to stub a collaborator, that collaborator should already
  be an injected port — if it isn't, that's a design smell the test just surfaced.

Net: `vi.mock` is effectively banned for internal modules; its only legitimate use is an unavoidable
third-party node edge, rare enough to justify in a comment.

<!-- Source: Spine-Testing.md -->

<a id='7ef4212b'></a>

### 4. The fixture + factory contract (so `tests/support/` is buildable day-one)

**Fixture doctrine (locked):** composed `test.extend`, not `beforeEach`/`freshDb()` sprinkled per file.
`tests/support/test.ts` exports the project `test` already extended (typed, lazily-initialized — a fixture
only runs if a test destructures it) with: scoped `db` (worker-template + per-file clone), the frozen
`clock`, the seeded `ids`, seeded users, the multi-user **caller fixtures** (`ownerCaller` / `otherCaller`
/ `adminCaller` / `anonCaller` — cross-user isolation becomes a one-line destructure), and the
`scriptedRunner`. A test imports `{ test, expect }` from `support/test` and gets the world.

**Custom matchers (cap at 5):** lift noisy patterns into typed one-liners — e.g. `toThrowTRPCError(code)`
(kills `.rejects.toBeTruthy()` silent-pass). Each must appear in ≥10 sites or encode a domain invariant
whose diff message beats a generic `toEqual`. Forbid generic equality/impl-detail/framework wrappers.

**Factory contract (the convention every `factories/*.ts` follows):**

- `makeX(overrides?: Partial<X>): X` — a **pure builder**: a fully-valid `X` with deterministic defaults
  (ids from the seeded generator, timestamps from the frozen clock). Never touches the db.
- `seedX(db, overrides?: Partial<X>): Promise<X>` — the **persisted** variant: `makeX` then insert.
- Defaults are **valid and minimal**; overrides shallow-merge; relations are ids by default
  (`seedChat(db, { withCharacter: true })` is explicit). Factories live only in `support/factories/`.

<!-- Source: Spine-Testing.md -->

<a id='e4a27ed2'></a>

### 5. The presence rule — what MUST have a test (the `test-presence` gate)

`test-mirror` enforces _where_ a test lands; it does **not** require one to exist. `test-presence` closes
that: required on the three surfaces where an untested change silently breaks behavior, and nowhere else
(no blanket per-file coverage — that breeds assertion-free filler):

| Surface                                             | Required test                                     | Rationale                                                              |
| --------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| every `domain/<f>/verbs/*.ts`                       | ≥1 `.test.ts` **or** `.int.test.ts` at its mirror | the verb IS the behavior; the service is a façade covered transitively |
| every `contract/*.ts` exporting a `z.object`/schema | a `.contract.test.ts` (parse + round-trip)        | the surface is the boundary other packages trust                       |
| every `persistence/*.ts`                            | a `.int.test.ts` against `freshDb`                | queries are only "correct" against a real db                           |

Exempt by nature: `index.ts` barrels, `context.ts` type-interfaces, pure-type `contract/` files. Client
`.ct.tsx`/`.spec.ts` lanes are NOT presence-gated (they're not in the fast `check`). Implemented as a
dep-cruiser/`tsc`-pattern check in the day-one suite (`CHECKLIST §A1`), blocking in pre-commit + CI.

**Coverage: REPORT-ONLY in v1 (ledger §6), a backslide floor later.** v8 provider (Vitest 4 AST
remapping), run via `pnpm test:coverage`, **NEVER** inside `pnpm check` (a green local run shouldn't
depend on coverage state). v1 ships **no `thresholds` block** — there's no baseline to pin yet and a hard
% just gets gamed. When a real baseline exists, add GLOBAL thresholds pinned at it and **ratchet UP** as a
backslide floor. The presence gate + the esoterica catalog (§6) are the real floor; for "are these tests
actually catching bugs?" use **mutation testing (Stryker)**, not a coverage number.

<!-- Source: Spine-Testing.md -->

<a id='020430a4'></a>

### 6. The "what to test" obligations, gathered (the part that was scattered)

The named test debts the domain docs created with their `→ test-time` and `## Esoteric / load-bearing`
notes — catalogued, not invented here:

- **The ~150 "preserve exactly" esoterica** (`CHECKLIST §C2`) — each load-bearing comment becomes a named
  test at its mirror, kind by what it pins (mostly `.test.ts` / `.contract.test.ts`). Headliners: the GCM
  AAD byte-string `${userId}|${provider}`, the ZWSP in `neutralizeMacros`, the `scopedCharacterId=''`
  sentinel, the PNG dual-chunk + CRC, the vLLM death-couple pipe-watchdog, `storedVersion`-beats-probe,
  the last-owner / owner-immutability guard EXISTS-on-UPDATE (D17), `deepMergeRequestBody` Layer-2 defense, every `ASSUMES(single-replica)`.
- **The differential oracle** (`CHECKLIST §C1`) — `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts`
  (at the mirror; the steady-clone driver is `tests/support/parity-runner.ts`): the rolling-pair breakpoint
  - cache-token delta diff vs the steady clone. The runbook + fixture are written **before** the chat
    scaffold. It pins parity only.
- **Memory's 6 chat-scoped semantics** (`domains/chat.md`) — the genuine "could silently regress" surface
  the oracle _cannot_ cover (memory is a rewrite, not a port). Each → a named `.int.test.ts` at the memory
  mirror. The one place "we have tests" and "we can prove parity" deliberately diverge.
- **Serde round-trip** (`spine/serialization-core`) — import → export → reimport is a single
  `.contract.test.ts` invariant on the one serde core.

<!-- Source: Spine-Testing.md -->

<a id='040f6648'></a>

### 7. Client / browser tests — Playwright, NOT Vitest browser

Vitest browser-mode is **not used** — it cold-cache dep-discovery _hangs_ (neo-tavern hit this and migrated
off it, 2026-06-20). Browser tests run on Playwright in two lanes, **neither in `pnpm check`** (no
fast-gate browser, same as e2e):

- **Component — Playwright CT** (`@playwright/experimental-ct-react`): `*.ct.tsx` at the client mirror,
  config `playwright-ct.config.ts`, run via `pnpm test:ct`. A mount entry resets stores + `localStorage`
  then wraps the component in **`CtProviders`** (`tests/support/ct-providers.tsx` — the production provider
  stack: a fresh `QueryClient` per mount with `retry:false`, real tRPC over `httpLink`, the real toaster so
  `notify.*` renders and asserts visually). tRPC is stubbed at the **network** boundary with
  **`routeTrpc(page, routes)`** (Playwright `page.route` — **NOT MSW**: CT runs the test in node and the
  component in the browser, so node-side `vi.fn` closures can't run in the browser worker). It records
  decoded inputs as the spy replacement (`trpc.count(proc)` / `trpc.lastInput(proc)`). Story wrappers
  (`_ct-stories.tsx`) hold the components CT mounts (CT only mounts from a non-test module).
- **e2e — Playwright** (`*.spec.ts` under `tests/e2e/`, config `playwright.config.ts`, `pnpm e2e`): the
  full running stack.
- **Client pure-logic stays in node.** Stores/hooks/lib with no DOM are `*.test.ts` in the node `unit`
  project and DO gate `pnpm check` — prefer extracting DOM-free logic to a plain function over a browser test.
- **Locator priority:** `getByRole` ≫ `getByLabel` ≫ `getByPlaceholder` ≫ `getByText` ≫ … ≫ `getByTestId`
  (last resort, never for buttons/inputs). **Real timers in form tests** (fake timers drift against React
  19's scheduler + debounce — assert with Playwright's auto-retrying `expect`).

The deeper client-test depth (per-feature story-wrapper conventions, the full CT recipe) is finalized at the
client scaffold; the **lanes + tooling above are locked now** (Playwright, not Vitest browser).

<!-- Source: Spine-Testing.md -->

<a id='d0ff9b60'></a>

### 8. Tags (Vitest 4.1+) — the runtime axis, orthogonal to suffix

A tag is a named bundle of per-test options applied to every test marked `{ tags: ['name'] }`, filterable
at the CLI (`--tag=slow`, `--tag=!live`) — it centralizes "this category needs X" instead of repeating
`{ timeout, retry }` inline. Two tags:

- **`slow`** — legitimately >5s (e.g. spawning the real Agent SDK subprocess): `timeout 30s + 1 retry`.
- **`live`** — hits real provider APIs (costs money); default-skipped behind `RUN_LIVE=1`; `pnpm test:live`
  runs them; long timeout.

Tags are the **runtime** axis (how a test behaves); **suffix** is the **kind** axis (what it tests + which
lane). They compose: a `.int.test.ts` can be tagged `slow`.

<!-- Source: Spine-Testing.md -->

<a id='1b78636d'></a>

### 9. Mutation testing (Stryker) — the test-quality ratchet — SCHEDULED (Phase 4c/5)

Coverage proves a line _ran_; it cannot prove a test _asserted_ anything about it. Mutation testing
closes that gap: Stryker flips operators / removes branches in source and reruns the suite — a
**surviving mutant** is a line a test covered but did not actually check (neo's founding
`isVllmBackend`-lying-gate class). Two lanes, both **on-demand / CI, never in `pnpm check`** (runs are
minutes; the check budget is structural-fast):

- **`pnpm test:mutation`** (`stryker.config.json`) — exploratory, `break:null`. Broaden scope on the
  CLI (`--mutate '…'`). Use to find tests that need real assertions.
- **`pnpm test:mutation:gate`** (`stryker.gate.config.json`) — the ratchet. Pinned to the highest-stakes
  pure modules (chat routing/assembly, credential resolution); **fails the build** below
  `thresholds.break`. Ratchet `break` UP as suites gain assertions (neo: aggregate 55%→66% over a
  hardening pass, break held ~6pts under).

Both run the node lanes via the `vitest` runner + the `typescript` checker. **Skeleton today** — the
configs exist but cannot run until there is code, a `vitest.config.ts`, a root `tsconfig.json`, and the
target modules; the mutate lists are forward-looking and `break` stays null (a null break never fails)
until a measured score calibrates it. Catalog: `@stryker-mutator/{core,vitest-runner,typescript-checker}`.
See `core/Core-Laws-and-Precedents.md` › Layer 6.

<!-- Source: Spine-Testing.md -->

<a id='cae558c7'></a>

### Invariants (gate candidates)

- `test-mirror` (`core/Core-0-Architecture-and-Structure.md §7`) — mirror path or `check` is red; exempts `support/` + `e2e/`.
- `test-presence` (§5) — verbs/schemas/persistence must have their required test.
- `test-determinism` (§3) — no ambient clock/random/unseeded-id under `tests/` (biome no-restricted-globals).
- `no-internal-mocks` (advisory, §3) — `vi.mock` of a sibling `src/` module is a review-flag; fakes inject at the root.

<!-- Source: Spine-Testing.md -->

<a id='77111b41'></a>

### Esoteric / load-bearing

- The fixture is the composed _production_ `compose/` wiring with the model scripted — tests exercise the
  real injection graph, not a parallel test-only assembly. A divergence between test and prod wiring is a bug.
- **`isolate: true` for ALL node projects** (the vitest default — kept deliberately, NOT neo's
  `isolate: false`). A fresh module graph per test file resets the single-tenant `globalMacroRegistry`
  for FREE — no per-test reset discipline to forget (the neo rot risk). `restoreMocks`/`unstubGlobals`/
  `unstubEnvs` (root rigor defaults) handle mock/stub/env cleanup. `integration` additionally runs
  **serially** (`fileParallelism: false`) — the tree-mutating gate self-tests need exclusivity; freshDb
  isolates data. Playwright CT isolates per-mount. (The 2–3× of `isolate: false` isn't worth the
  reset-discipline footgun; revisit only if the suite gets slow.)
- **`.parity` is excluded** from the default run + the fast CI lane on purpose — a deliberate gate
  (`pnpm test:parity`) run before the chat/memory scaffold and in the nightly, never in the inner loop.
- **Vitest browser-mode is forbidden** — the cold-cache hang is the reason; browser coverage is Playwright's.
- Determinism is a _correctness_ property: the frozen clock is what makes the rolling-pair breakpoint and
  the memory-recall ordering assertions stable turn-to-turn.
