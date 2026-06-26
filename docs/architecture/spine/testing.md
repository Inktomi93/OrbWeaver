# Orbweaver — `testing`: one layout, four kinds, a gate that forces them home

> **Status: planning (authoritative detail).** Testing is the cross-cutting thread that every domain doc
> defers to with a bare `→ test-time` enforcer note and a `## Esoteric / load-bearing` list. Until now
> the *layout* was locked (`structure.md §5` + the `test-mirror` gate) but the *policy* — how we write a
> test here, what must have one, mock/determinism rules, the factory contract, where the oracle and the
> ~150 esoterica land — was scattered across 40 docs. This doc is the one-stop home for all of it, so
> "how do we test X?" has exactly one answer, the same way "where does X live?" does.
> Authoritative upstream: `structure.md §5` (the layout + `test-mirror` gate, which this doc does not
> restate but extends), `reports/PRE-SCAFFOLD-CHECKLIST.md §A/§C` (the day-one stand-up + the oracle +
> esoterica obligations), `tiers/entry.md` (the composition-root injection model the mock policy rides on),
> `spine/serialization-core.md` (the round-trip the `.contract` kind pins). Decisions committed in
> `reports/DECISIONS-LEDGER.md §6`.

## 0. The principle — the test path is a derivation, the test kind is a suffix, and a gate forces both

`structure.md §5` already locks the load-bearing 80%: one central `tests/` tree mirroring `src/` 1:1
(prefix-swap path), kind-by-suffix, Vitest projects-by-suffix, the composed `test.extend` fixture
doctrine, and the `test-mirror` gate that turns `check` red if a test doesn't land at its computed path.
This doc adds the missing 20%: **the kind taxonomy as named projects, the presence rule (what MUST have a
test), the mock/determinism doctrine, the factory contract, and the homes for the oracle + esoterica +
memory semantics** — each with its enforcer, because a prose-only test policy is not a policy.

## 1. The four kinds (each is a Vitest project, selected by suffix)

| Suffix | Kind | Touches | Speed / project | What it pins |
|---|---|---|---|---|
| `.test.ts` | **unit** | nothing — pure logic, kit primitives, builders, dispatch tables, SHAPE computation | fast; default `test` run | a function's behavior in isolation |
| `.int.test.ts` | **integration** | a real libSQL `:memory:` db (the fixture's `freshDb`) | medium; `int` project | persistence queries, service-through-db, migrations, the memory recall semantics |
| `.contract.test.ts` | **golden / surface** | no db — a stable *shape* | fast; `contract` project | a `z.object` parse/round-trip, a serde round-trip (`spine/serialization-core`), a wire body (assembled-prompt / provider request map), a db-schema snapshot |
| `.parity.test.ts` | **differential oracle** | the steady clone (`/tmp/neo-tavern-steady`) + a fixture db | slow; **opt-in** `parity` project, NOT in the default run | byte-equality of the PARITY surface vs neo-tavern (assembled prompt + cache placement + token tallies) |

**Why `.parity` is its own kind, not a `.int`:** it stands up an external process (the steady clone),
it's slow, and it must be *excludable* from the inner-loop and the default CI fast lane. It lives in a
non-mirror tree (§2) and runs as a separate Vitest project so `pnpm test` stays fast and `pnpm test:parity`
is the deliberate, pre-chat-scaffold gate. The honest caveat travels with the kind: **the oracle validates
parity, never memory** — memory is an intentional rewrite and gets `.int` behavioral tests (§5), not a diff.

A file's unit + integration tests sit **together** next to its mirror (e.g.
`tests/server/domain/chat/memory/recall.test.ts` and `recall.int.test.ts` side by side) — never scattered.

## 2. The tree (extends `structure.md §5` — two non-mirror trees named explicitly)

```
tests/
├── support/          shared test substrate (NOT a mirror) — §4
│   ├── fixtures.ts       the composed `test` (test.extend → db, clock, ids, seeded users, services)
│   ├── factories/        entity builders (makeChat, makeCharacter, …) — §4 contract
│   ├── db.ts             freshDb / seed helpers (libSQL :memory:)
│   ├── clock.ts          frozen clock + advance() — determinism (§3)
│   └── ids.ts            seeded typeid generator — deterministic ids (§3)
├── parity/           the differential oracle (NOT a mirror — a harness like support/) — §6
│   ├── runner.ts         drives the steady clone against a fixture, captures SEND/ASSEMBLE/RECEIVE
│   └── pipeline-breakpoint.parity.test.ts   the rolling-pair + cache-token diff (CHECKLIST §C1)
├── server/           mirrors packages/server/src/  EXACTLY
├── contracts/        mirrors packages/contracts/src/
├── db/               mirrors packages/db/src/
└── client/           component / e2e (Playwright CT) — mirrors features/ (§7, provisional)
```

`support/` and `parity/` are the only non-mirror trees; the `test-mirror` gate exempts exactly these two
directories and treats every other path as a strict prefix-swap mirror.

## 3. Determinism + mock doctrine (the two rules that keep tests honest)

**Determinism — no wall-clock, no randomness in a test or a factory.** The fixture injects a **frozen
clock** (`tests/support/clock.ts`, `advance(ms)` to move it) and a **seeded id generator**
(`tests/support/ids.ts` — a counter-backed `typeid`), and the composition root accepts both as injected
deps (the same injection seam `tiers/entry.md` defines for production). A test that reaches for
`Date.now()` / `Math.random()` / `new Date()` / `typeid()`-unseeded is non-reproducible and is a gate
candidate (`test-determinism`, biome no-restricted-globals scoped to `tests/`). This mirrors the house
rule that load-bearing time/id must be injected, never ambient.

**Mock doctrine — fake at the edges, inject at the root, never mock an internal module.**
- **DB:** use a **real libSQL `:memory:`** db for `.int` (the fixture's `freshDb`). We do not mock the db
  — the whole point of the cake is that persistence is real, cheap, and in-process.
- **The model / provider HTTP:** the only true external I/O. Make it deterministic via the existing
  **scripted-override seam** (`RUNNER_OVERRIDE` / `scripted-override.ts`), not a mock framework — script
  the response. Provider request *shape* is pinned by a `.contract` test; provider *behavior* is scripted.
- **Cross-feature deps:** inject a fake at the composition root (the §-`entry` injection model), never
  `vi.mock()` a sibling module. If a test needs to stub a collaborator, that collaborator should already
  be an injected port — if it isn't, that's a design smell the test just surfaced, not a reason to reach
  for module mocking.

Net: `vi.mock` is effectively banned for internal modules; its only legitimate use is an unavoidable
third-party node edge, and that should be rare enough to justify in a comment.

## 4. The fixture + factory contract (so `tests/support/` is buildable day-one)

**Fixture doctrine (locked, `structure.md §5`):** composed `test.extend`, not `beforeEach`/`freshDb()`
sprinkled per file. `tests/support/fixtures.ts` exports the project `test` already extended with: a
`freshDb` (migrated libSQL `:memory:`), the frozen `clock`, the seeded `ids`, a seeded default user, and
the composed services (the same `compose/` wiring as production, with the model scripted). A test imports
`{ test, expect }` from `support/fixtures` and gets the world.

**Factory contract (NEW — the convention every `factories/*.ts` follows):**
- `makeX(overrides?: Partial<X>): X` — a **pure builder**. Returns a fully-valid `X` with deterministic
  defaults (ids from the seeded generator, timestamps from the frozen clock). Never touches the db.
- `seedX(db, overrides?: Partial<X>): Promise<X>` — the **persisted** variant: `makeX` then insert,
  returns the row. Use in `.int` tests.
- Defaults are **valid and minimal** (the smallest thing that passes the contract); overrides are a
  shallow merge. Relations are ids by default; a factory never auto-creates a graph unless asked
  (`seedChat(db, { withCharacter: true })` is explicit).
- Factories live only in `support/factories/` — never inline in a test, never in `src/`.

## 5. The presence rule — what MUST have a test (the `test-presence` gate, NEW)

`test-mirror` enforces *where* a test lands; it does **not** require one to exist. The 12th gate closes
that: presence is required on the three surfaces where an untested change silently breaks behavior, and
nowhere else (no blanket per-file coverage — that just breeds assertion-free filler):

| Surface | Required test | Rationale |
|---|---|---|
| every `domain/<f>/verbs/*.ts` | ≥1 `.test.ts` **or** `.int.test.ts` at its mirror | the verb IS the behavior; the service is a façade covered transitively |
| every `contract/*.ts` exporting a `z.object`/schema | a `.contract.test.ts` (parse + round-trip) | the surface is the boundary other packages trust |
| every `persistence/*.ts` | a `.int.test.ts` against `freshDb` | queries are only "correct" against a real db |

Exempt by nature (nothing to assert): `index.ts` barrels, `context.ts` type-interfaces, pure-type
`contract/` files. Implemented as a dep-cruiser/`tsc`-pattern presence check in the day-one suite
(`CHECKLIST §A1`), blocking in pre-commit + CI.

**Coverage threshold: report-only in v1.** `coverage` merges at root and is *reported*, but no hard
line/branch % fails CI — number-chasing produces gamed, assertion-light tests. The presence gate +
the esoterica catalog (§6) are the real floor. Revisit a threshold post-v1 if a regression slips.

## 6. The "what to test" obligations, gathered (the part that was scattered)

These are the named test debts the domain docs created with their `→ test-time` and
`## Esoteric / load-bearing` notes. They are catalogued, not invented here — this is the index:

- **The ~150 "preserve exactly" esoterica** (`CHECKLIST §C2`) — each load-bearing comment becomes a
  named test or asserted invariant at its mirror path, kind chosen by what it pins (mostly `.test.ts` /
  `.contract.test.ts`). The headliners: the GCM AAD byte-string `${userId}|${provider}`, the
  ZWSP-between-the-braces in `neutralizeMacros`, the `scopedCharacterId=''` sentinel, the PNG
  dual-chunk + CRC, the vLLM death-couple pipe-watchdog, `storedVersion`-beats-probe, the last-admin
  EXISTS-on-UPDATE, the `globalMacroRegistry` single-tenant note, `deepMergeRequestBody` Layer-2 defense,
  every `ASSUMES(single-replica)` annotation. A from-structure rebuild silently drops these unless each
  is a red-on-regression test.
- **The differential oracle** (`CHECKLIST §C1`) — `tests/parity/pipeline-breakpoint.parity.test.ts`:
  the rolling-pair breakpoint + cache-token delta diff vs the steady clone. The runbook + fixture are
  to be written **before** the chat scaffold (discovering it's a multi-day stand-up at that point is the
  worst time). It pins parity only.
- **Memory's 6 chat-scoped semantics** (`domains/chat.md`) — the genuine "could silently regress"
  surface the oracle *cannot* cover (memory is a rewrite, not a port). Each semantic → a named
  `.int.test.ts` at the memory feature mirror. This is the one place "we have tests" and "we can prove
  parity" diverge, and it's deliberate.
- **Serde round-trip** (`spine/serialization-core`) — import → export → reimport is a single
  `.contract.test.ts` invariant on the one serde core, not a cross-domain contract.

## 7. Client testing (provisional — finalized with the client rebuild)

The client is a deferred greenfield rebuild, so this is the minimal committed rule, not the full standard:
`tests/client/` mirrors `features/`; component tests are Playwright CT at the mirror path; e2e specs live
under `tests/client/e2e/` (non-mirror, a harness). The component-test depth standard (render contract,
interaction patterns, the e2e harness spec) is **deferred to the client scaffold** and will be appended
here then — flagged so it reads as an honest gap, not a false lock.

## Invariants (gate candidates)

- `test-mirror` (EXISTING, `structure.md §7`) — mirror path or `check` is red; exempts `support/` + `parity/`.
- `test-presence` (NEW, §5) — verbs/schemas/persistence must have their required test.
- `test-determinism` (NEW, §3) — no ambient clock/random/unseeded-id under `tests/` (biome no-restricted-globals).
- `no-internal-mocks` (advisory, §3) — `vi.mock` of a sibling `src/` module is a review-flag; fakes inject at the root.

## Esoteric / load-bearing

- The fixture is the composed *production* `compose/` wiring with the model scripted — tests exercise the
  real injection graph, not a parallel test-only assembly. A divergence between test and prod wiring is a bug.
- `.parity` is excluded from the default `pnpm test` and from the fast CI lane on purpose; it is a
  deliberate gate (`pnpm test:parity`) run before the chat/memory scaffold and in the nightly, never in
  the inner loop.
- Determinism is a *correctness* property here, not a nicety: a frozen clock is what makes the
  rolling-pair breakpoint and the memory-recall ordering assertions stable turn-to-turn.
