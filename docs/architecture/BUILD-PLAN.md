# Orbweaver — build plan (the ordered runbook)

> **Status: the single sequential guide — what to build, in what order, with the checkpoint that proves
> each phase done.** It consolidates the order from `reports/DECISIONS-LEDGER.md §4` (the sequence + the
> `@orb/contracts` DAG + the kit boot-order), the per-phase conditions from
> `reports/PRE-SCAFFOLD-CHECKLIST.md §A–E`, and the rationale from `reports/boundary-scan.md`. If anything
> here disagrees with the ledger, the ledger wins (this doc is the expansion, not a new authority).
>
> **The spine of the order:** build bottom-up so every import resolves downward —
> `kit → contracts → db → server (foundation → infra → domain[leaf-first] → transport → entry) → client`,
> with **chat + memory LAST** behind the differential oracle. The cake is validated at resolve-time on the
> empty tree (Phase 0) before any feature code exists.

---

## Phase 0 — Workspace + gates (before ANY feature code)
The highest-leverage phase: stand up the fences before the code, so the cake is physics from commit one.
1. `pnpm` workspace + the 5 packages (`kit·contracts·db·server·client`) with `package.json` + `tsconfig`.
   **Pin versions now** — 2026-latest stable of the toolchain + core stack: Node/TS/Hono/Drizzle/tRPC (`ledger §3`; `@orb/*` already decided). UI engine stays deferred to Phase 6. **Per-tier runtime libs join the catalog as their tier is built**, not all here — e.g. observability's `pino`/`pino-pretty` + `@opentelemetry/*` land at 4a (`tiers/foundation.md` › Runtime dependencies), `sharp` at 4b.
2. Stand up the **gate suite** (`structure.md §7`, 13 gates) + the bespoke domain rules as dep-cruiser/biome/`tsc` patterns, wired into a **blocking `check`** (pre-commit + CI + a PreToolUse hook since agents author). `CHECKLIST §A1`.
3. Stand up **`tests/support/`** (composed `test.extend` → `freshDb`, frozen `clock`, seeded `ids`, factories) + the Vitest **node** projects in one `vitest.config.ts` via `test.projects` (`unit` `.test` · `integration` `.int.test` · `contract` `.contract.test` · `types` `.test-d.ts` · `parity` `.parity.test`, opt-in) + the `test-presence`/`test-determinism` gates. **Browser = Playwright, not Vitest** (it hangs): `playwright-ct.config.ts` (`.ct.tsx`) + `playwright.config.ts` (`.spec.ts`), separate runners, not in `check`. `CHECKLIST §A4`, `spine/testing.md`.
4. Reserve the AI-native seams in code (`ClipKind`/`clip.scope` types, `WorkloadKind:'world-state'` stub, `observer` participant kind). `CHECKLIST §A2`.

**✅ Checkpoint:** `pnpm check` is green on the empty cake; an intentional cross-tier import (e.g. `foundation`→`domain`) **fails to resolve**; an empty `.test.ts` runs.

---

## Phase 1 — `@orb/kit` (the leaf — everything imports down into it)
Build in the dissolution boot-order (`shared-dissolution.md §8`):
1. `ids`, `errors` first (the universal leaf — `ids` had 446 importers).
2. The primitives: `guards`, `strings`, `objects`, `json`, `time`, `tokens`, `slug`, `error-message`, `fix-markdown`, `speaker-label`, `vector-math`, `replay-buffer`, `stats-tally`, `png-card-chunk`, `assets`, `persona`.
3. The engines: **`macro/` first**, then `regex/` + `guided` (both depend on `macro`); `world-info/` tuples (before the 3 contracts that import them).

**✅ Checkpoint:** kit unit tests green; `kit-purity` gate green (zero `node:*`/`contracts`/`db`/domain imports).

---

## Phase 2 — `@orb/contracts` (the wire) — in the internal DAG order
**Not alphabetical** — these edges cause `tsc` errors if violated (`ledger §4`):
1. `versioned-config`
2. `world-info` (role/scope tuples) · `connection` (`chatApi`/`chatSource`) · `chat` (`group-config` defaults) + `regex`
3. `settings` (pulls versioned-config + connection + chat + regex — the counterintuitive edge) · `preset` (pulls versioned-config)
4. `persona` + `character` (pull the world-info tuples)
5. provider result contracts (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) → **then** `role-clients`
6. the remainder: `identity`, `session`, `credentials`, `assets`, `tag`, `stats`, `buddy`, `embeddings`, `search`, `memory`, `providers`, `discovery`, `workloads`, `import`, `export`, `admin`, `sessions`.

**✅ Checkpoint:** `tsc` clean (DAG honored); `.contract.test` schema round-trips green; `no-inline-types`/`no-inline-union-redecl`/`exhaustive-dispatch` gates green.

---

## Phase 3 — `@orb/db`
1. `custom-types` (the `vector32` F32_BLOB codec), `client` (libSQL factory + PRAGMAs), `db/kit` (batch / db-errors / fetch-owned / insert-chunk / parsers).
2. `schema/*` (one file per producing domain) + `relations`; `migrations/0000_baseline`.
3. **Write the migration DATA scripts, not just the schema** (`CHECKLIST §B1`): `proposedTags→character_tags.status`, `character_books` re-key (+ orphan pre-flight), stats regroup + character de-pin (same/adjacent file), WI persona-book join rewire, per-migration `PRAGMA foreign_keys=OFF`, `backupBeforeMigrate`.
4. `.credentials-key` boot decrypt-probe + the stdout backup warning (`CHECKLIST §B2`).

**✅ Checkpoint:** `migrate` + `assertReferentialIntegrity` (`foreign_key_check`) green; `.int.test`s pass against libSQL `:memory:`.

---

## Phase 4 — `@orb/server`, bottom-up tiers
### 4a. `foundation/` — `env` (sole `process.env` reader), `config` (version only), `observability` (+ `debug/inspect`, the dissolved debug domain). **Catalog gains the observability deps here:** `pino`/`pino-pretty` + `@opentelemetry/*` (`tiers/foundation.md` › Runtime dependencies). The `noConsole` total-ban (`ENFORCEMENT.md`) goes live the moment server code lands — `getLog()`/`logger` is the only sanctioned output.
### 4b. `infra/` — `crypto`, `network`, `storage`, `image` (the sharp adapter), `auth` (+ `modes/`), `providers/` (`roles`, `contract`, `backends/{openrouter(+runners), agent-sdk(+session), custom-byo, kit(+openai-compat)}`, `vllm/{engine,surfaces}`). Include the **local-light embed/rerank tier** (`CHECKLIST §A3`) and the `VLLM_DISABLED` escape hatch (`§D3`).
### 4c. `domain/` — **LEAF-FIRST**, in waves (a domain only builds after its injected deps):
- **Wave 1** (no cross-domain deps): `credentials` · `tag` · `persona` · `preset` · `world-info` · `assets` · `sessions` · `stats` · `settings` · `admin`
- **Wave 2** (consumed by the rest): `embeddings` · `search`
- **Wave 3**: `discovery` · `workloads` · `import` · `export` · `buddy`
- Per domain, build the slots in order: `contract/` → `persistence/` → `verbs/` → `service.ts`/`context.ts`/`index.ts`. Add the failure surfaces as you go (`§D1` fire-and-forget audit + `content_hash` catch-up sweep; `§D4` custom-byo `contextWindow`).
### 4d. `transport/` — `trpc` (+ `routers`), `jobs` (workloads worker + catalog scheduler), `rate-limit`. Wrap SSE subscriptions in the typed error middleware (`§D2`).
### 4e. `entry/` — `compose/` (services, runner-env, event-bus, role-clients, effective-config), `boot/` (migrate + seeds + reclaim-locks), `auth/seam.ts`, `http/`, `import/run-profile-import.ts`, `lifecycle.ts`.

**✅ Checkpoint:** per-domain `.int` + `.contract` tests green; **all 13 gates green**; the app boots, migrates, serves `healthz`.

---

## Phase 5 — chat + memory (LAST — highest risk, behind the oracle)
1. **Write the differential-oracle runbook + fixture FIRST** (`CHECKLIST §C1`) → `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts` (at the mirror; steady-clone driver in `tests/support/parity-runner.ts`) against the steady clone (`/tmp/neo-tavern-steady`). Don't start the chat scaffold until this exists.
2. Build `chat/`: `engine/`, `assembly/` (+ `world-info/`), the explicit resolution-order pipeline (RESOLVE→GATHER→BUILD→SHAPE), and the **§8 rolling-pair cache breakpoint** (preserve + upgrade — dropping it = ~5300-tok/turn regression).
3. Build the `memory/` subsystem (`build/`, `recall/`, `persistence/`) — the **6 chat-scoped semantics → `.int.test`s** (the surface the oracle deliberately can't cover).
4. The **~150 "preserve exactly" esoterica → named tests** (`CHECKLIST §C2`): the AAD byte-string, ZWSP macro-neutralize, the PNG dual-chunk+CRC, the vLLM death-couple watchdog, every `ASSUMES(single-replica)`.

**✅ Checkpoint:** `pnpm test:parity` green (assembled-prompt + cache-token parity vs the steady clone); memory-semantics `.int`s green.

---

## Phase 6 — `@orb/client` (deferred rebuild)
1. Pick the UI headless engine (recommended: Base UI) — `ledger §3`.
2. Feature-sliced layout; convert any copied shadcn atoms to `#` imports (no `@/`).
3. Client component tests = **Playwright CT** (`.ct.tsx` at the `tests/client/` mirror); e2e = **Playwright** (`.spec.ts` under `tests/e2e/`). No Vitest browser. Client pure-logic stays node `.test.ts`.

**✅ Checkpoint:** the full stack runs end-to-end; client component + e2e tests green.

---

## Cross-cutting (every phase)
- **Tests travel with code** — each new file's test lands at its mirror path or `check` goes red (`test-mirror` + `test-presence`).
- **Owned risks, no action** (`CHECKLIST §E`): the Qwen3-VL single-model concentration (cosine≈1.0 probe guards it); single-replica is the v1 stance (every `ASSUMES(single-replica)` site has a named DB-backed replacement seam).
- **The verification method that works** (keep using it): general-purpose agents reading whole files + a grep sweep for losing-side strings after any structural change.
