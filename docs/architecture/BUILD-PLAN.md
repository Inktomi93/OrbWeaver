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
>
> **Progress (2026-06-27):** Phases 0–4b are BUILT + committed; **Phase 4c (domain, leaf-first) is NEXT.**
> See `_STATUS.md` and ledger **D40** (the Phase-0→4b audit remediation) for the exact state.

---

## Phase 0 — Workspace + gates (before ANY feature code)
The highest-leverage phase: stand up the fences before the code, so the cake is physics from commit one.
1. `pnpm` workspace + the 5 packages (`kit·contracts·db·server·client`) with `package.json` + `tsconfig`.
   **Pin versions now** — 2026-latest stable of the toolchain + core stack: Node/TS/Hono/Drizzle/tRPC (`ledger §3`; `@orb/*` already decided). UI engine stays deferred to Phase 6. **Per-tier runtime libs join the catalog as their tier is built**, not all here — e.g. observability's `pino`/`pino-pretty` + `@opentelemetry/*` land at 4a (`tiers/foundation.md` › Runtime dependencies), `sharp` at 4b.
2. Stand up the **gate suite** (`structure.md §7`, 13 gates) + the bespoke domain rules as dep-cruiser/biome/`tsc` patterns, wired so they **BLOCK**: the full `pnpm check` runs at **pre-push** (lefthook) + in **CI**, a fast Biome pass runs at **pre-commit** on staged files, and — since agents author — a **PostToolUse Biome belt** fires on every `Edit\|Write` (`exit 2`). `CHECKLIST §A1`.
3. Stand up **`tests/support/`** (composed `test.extend` → `freshDb`, frozen `clock`, seeded `ids`, factories) + the Vitest **node** projects in one `vitest.config.ts` via `test.projects` (`unit` `.test` · `integration` `.int.test` · `contract` `.contract.test` · `types` `.test-d.ts` · `parity` `.parity.test`, opt-in) + the `test-presence`/`test-determinism` gates. **Browser = Playwright, not Vitest** (it hangs): `playwright-ct.config.ts` (`.ct.tsx`) + `playwright.config.ts` (`.spec.ts`), separate runners, not in `check`. `CHECKLIST §A4`, `spine/testing.md`.
4. Reserve the AI-native seams in code (`ClipKind`/`clip.scope` types, `WorkloadKind:'world-state'` stub, `observer` participant kind). `CHECKLIST §A2`.

**✅ Checkpoint:** `pnpm check` is green on the empty cake; an intentional cross-tier import (e.g. `foundation`→`domain`) **fails to resolve**; an empty `.test.ts` runs.

---

## Phase 1 — `@orb/kit` (the leaf — everything imports down into it)
Build in the dissolution boot-order (`shared-dissolution.md §8`):
1. `ids`, `errors` first (the universal leaf — `ids` had 446 importers).
2. The primitives: `guards`, `strings`, `objects`, `json`, `time`, `tokens`, `slug`, `error-message`, `fix-markdown`, `speaker-label`, `vector-math`, `replay-buffer`, `stats-tally`, `png-card-chunk`, `assets`, `message-role` (D32 — the canonical `system|user|assistant` axis + ST bimap; the role atom every injector + chat message shares).
3. The engines: **`macro/` first**, then `regex/` + `guided` (both depend on `macro`); `injection/` (D32 — the shared `{depth,role}` placement; depends on `message-role`); then `world-info/` + `persona/` (depend on `message-role` + `injection`), before the contracts that import their tuples.

**✅ Checkpoint:** kit unit tests green; `kit-purity` gate green (zero `node:*`/`contracts`/`db`/domain imports).

---

## Phase 2 — `@orb/contracts` (the wire) — in the internal DAG order
**Not alphabetical** — these edges cause `tsc` errors if violated (`ledger §4`):
1. `versioned-config`
2. `world-info` (role/scope tuples) · `connection` (`chatApi`/`chatSource`) · `chat` (`group-config` defaults) + `regex`
3. `settings` (pulls versioned-config + connection + chat + regex — the counterintuitive edge) · `preset` (pulls versioned-config)
4. `persona` + `character` (pull the world-info tuples)
5. provider result contracts (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) → **then** `role-clients`
6. the remainder: `identity`, `session`, `credentials`, `assets`, `tag`, `stats`, `buddy`, `embeddings`, `search`, `memory`, `providers`, `discovery`, `workloads`, `import`, `export`, `admin`.

**✅ Checkpoint:** `tsc` clean (DAG honored); `.contract.test` schema round-trips green; `no-inline-types`/`no-inline-union-redecl`/`exhaustive-dispatch` gates green.

---

## Phase 3 — `@orb/db`
1. `custom-types` (the `vector32` F32_BLOB codec), `client` (libSQL factory + PRAGMAs), `db/kit` (batch / db-errors / fetch-owned / insert-chunk / parsers).
2. `schema/*` (one file per producing domain) + `relations`; `migrations/0000_baseline`.
3. **Write the migration DATA scripts, not just the schema** (`CHECKLIST §B1`): `proposedTags→character_tags.status`, `character_books` re-key (+ orphan pre-flight), stats regroup + character card-flatten (D28 — card content onto the flat `characters` row; no version table, no de-pin), WI persona-book join rewire, per-migration `PRAGMA foreign_keys=OFF`, `backupBeforeMigrate`.
4. `.credentials-key` boot decrypt-probe + the stdout backup warning (`CHECKLIST §B2`).

**✅ Checkpoint:** `migrate` + `assertReferentialIntegrity` (`foreign_key_check`) green; `.int.test`s pass against libSQL `:memory:`.

---

## Phase 4 — `@orb/server`, bottom-up tiers
### 4a. `foundation/` — `env` (sole `process.env` reader), `config` (version only), `observability` (+ `debug/inspect`, the dissolved debug domain). **Catalog gains the observability deps here:** `pino`/`pino-pretty` + `@opentelemetry/*` (`tiers/foundation.md` › Runtime dependencies). The `noConsole` total-ban (`ENFORCEMENT.md`) goes live the moment server code lands — `getLog()`/`logger` is the only sanctioned output.
### 4b. `infra/` — `crypto`, `network`, `storage`, `image` (the sharp adapter), `auth` (+ `modes/`), `providers/` (`roles`, `contract`, `backends/{openrouter(+runners), agent-sdk(+session), custom-byo, kit(+openai-compat)}`, `vllm/{engine,surfaces}`). Include the **local-light embed/rerank tier** (`CHECKLIST §A3`) and the `VLLM_DISABLED` escape hatch (`§D3`).
### 4c. `domain/` — **LEAF-FIRST**, in waves (a domain only builds after its injected deps):
- **Wave 1** (no cross-domain deps): `credentials` · `tag` · `persona` · `preset` · `world-info` · `assets` · `sessions` · `stats` · `settings` · `admin` · `character` (near-leaf — `mintSyntheticGroupCharacter` + flat-card CRUD; D38) · `notifications` (NEW — the per-user durable inbox + stream; chat emits into it via an injected op, so it lands before chat — `domains/notifications.md`, ledger D16). Intra-wave compose order: `sessions → admin/guard → {credentials, settings, …}` (D38 — `admin/guard.ts` is the `can()` seam, built first; others inject the guards).
- **Wave 1.5** (D38): `connection` — solo, BETWEEN W1 and W2. Injects `credentials.resolve` (W1) + `providers.fetchOrCatalog` (infra 4b); embeddings + search (W2) inject `connection.resolveRole`, so it must precede them. Lands `DEFAULT_CHAT_MODEL_ID`/`DEFAULT_OR_CHAT_MODEL_ID` in `@orb/contracts/connection` + re-wires foundation `/_debug/info`.
- **Wave 2** (consumed by the rest): `embeddings` · `search`
- **Wave 3**: `discovery` · `workloads` · `import` · `export` · `buddy`
- **Prerequisite (DONE, D38):** `@orb/contracts/events` — the closed in-process domain-event union (`character.updated` + `asset.created`) the Wave-1 emitters + the embeddings indexer reference.
- Per domain, build the slots in order: `contract/` → `persistence/` → `verbs/` → `service.ts`/`context.ts`/`index.ts`. Add the failure surfaces as you go (`§D1` fire-and-forget audit + `content_hash` catch-up sweep; `§D4` custom-byo `contextWindow`).
### 4d. `transport/` — `trpc` (+ `routers`), `jobs` (workloads worker + catalog scheduler), `rate-limit`. Wrap SSE subscriptions in the typed error middleware (`§D2`).
### 4e. `entry/` — `compose/` (services, runner-env, event-bus, role-clients, effective-config), `boot/` (migrate + seeds + reclaim-locks), `auth/seam.ts`, `http/`, `import/run-profile-import.ts`, `lifecycle.ts`.

**✅ Checkpoint:** per-domain `.int` + `.contract` tests green; **all 13 gates green**; the app boots, migrates, serves `healthz`.

---

## Phase 5 — chat + memory + the UNIFIED roster/group/multi-human system (LAST, highest risk; built WHOLE)
> **No feature-phasing (ledger D16).** This phase delivers the ENTIRE unified system in ONE cohesive build — a chat is a roster of participants (humans + characters); group-ness is DATA, not a branch (`no-if(isGroup)`; solo = roster-of-1, byte-identical). neo-tavern's Phase A/B (solo-first → multi-human bolt-on) + its 12-step order are neo RETROFIT artifacts and are NOT carried — orbweaver greenfields everything. **`domains/chat.md` Part III is the authoritative design.** The `notifications` domain (Phase 4c) + presence (Phase 4d, transport) are wired here. **Born-compliant prerequisite (D44/D45) — land in the `@orb/contracts` pass BEFORE this phase assembles chat content:** the message-content model (`MessageContentBlock` — text/media/html-card blocks, NOT one string), `ChatHistoryMessage.content` widened `string`→content-parts (text/image), and the `ModelCapability.vision` axis. Widening these after chat is built whole is the cross-cutting retrofit the spec-it-first discipline avoids.
1. **Write the differential-oracle runbook + fixture FIRST** (`CHECKLIST §C1`) → `tests/server/domain/chat/pipeline-breakpoint.parity.test.ts` (at the mirror; steady-clone driver in `tests/support/parity-runner.ts`) against the steady clone (`/tmp/neo-tavern-steady`). The oracle gates the **assembly + cache-token PARITY surface only**; the multi-human/group/invites/notifications/presence/arbitration pieces are NOT diffable (intentional rewrites) — they ship with `.int`/`.contract` tests in the same build.
2. Build `chat/` WHOLE: the **roster + membership lifecycle** (`chat_participants` join/leave/visibility, `chat_invites` + the ONE insert chokepoint, kick/self-leave/host-handoff), the **turn-identity triple** + `pending_turns` + per-member **COUNT** budget + owner-consent (`max-pro-sub` by-proxy refused), **arbitration** (@mention/natural/list/pooled/manual/smart + auto-mode + ban-last-speaker, lock-per-speaker), **two-axis generation** (narrator/per-speaker × merged/scoped), **room overrides** (4 host-only fields), the **group macros**, the **typed per-verb auth matrix + the default-deny enforcer** (covering SSE subscribe + lineage + injections + fork + anchor); the explicit RESOLVE→GATHER→BUILD→SHAPE pipeline + the **§8 rolling-pair breakpoint** (preserve+upgrade; undefined for multi-responder/narrator tails — dropping it = ~5300-tok/turn regression).
3. Build the `memory/` subsystem (`build/`, `recall/`, `persistence/`) — the **6 chat-scoped semantics** + **group-as-character** (synthetic group char authors narrator turns — never NULL; `chat_digest_speakers`; `scopedCharacterId`; merged/scoped mirrors `cardScope`; egocentric-only; **host-only room search v1**) → `.int.test`s.
4. The **~150 "preserve exactly" esoterica → named tests** (`CHECKLIST §C2`) + neo's **§9 security must-dos** (host-wallet/count budget, server-stamp author + sanitize member content, host-only overrides, host-approved cross-user WI, invite hardening, server-derived presence, bus payload allowlist) + the **§10.4 cross-cutting invariants** (no-if(isGroup) byte-identical, turn-identity triple, max-pro-sub-by-proxy, trusted-label, AI-@mention-never-forces, presence→cast→cache) → named tests.

**✅ Checkpoint:** `pnpm test:parity` green (assembled-prompt + cache-token parity vs the steady clone); the unified-system `.int`/`.contract` suites green (roster lifecycle · invites/redeem · notifications durable-first · presence cast-gating · arbitration policies · two-axis generation · room overrides · memory 6-semantics + group-as-character); a **solo chat is byte-identical** before/after the roster (the no-if(isGroup) contract test).

---

## Phase 6 — `@orb/client` + `@orb/ui` (deferred rebuild)
**Authoritative spec: `docs/architecture/client.md` (ledger D42).** Build against it. In short:
1. Stand up **`@orb/ui`** (NEW package — the frontend cake leaf: `kit ← contracts ← ui ← client`): domain-agnostic primitives over **Base UI** (`@base-ui/react`) — **NO shadcn, NO Radix**; the satellites (cmdk/vaul/sonner/react-resizable-panels/@dnd-kit/nivo) + **Streamdown** (`@orb/ui/markdown`) sealed behind it; CVA variant-unions; DTCG tokens → derived Tailwind v4 `@theme`. The UI boundaries are resolver PHYSICS (client's `package.json` lacks the primitive libs → cannot import them).
2. `@orb/client` — carry neo's STRUCTURE (feature-slice · surfaces/anchors · `state:files` · intent tokens · the gate battery); **container-driven** layout (4-tier; `@media` only in app-shell); Query (server) + gated Zustand (client); TanStack Router **minimal** (single-route shell, no file-based codegen); the 4 sealed cross-lib gotchas. `#` imports, no `@/`.
3. Client component tests = **Playwright CT** (`.ct.tsx` at the `tests/client/` mirror); e2e = **Playwright** (`.spec.ts` under `tests/e2e/`). No Vitest browser. Client pure-logic stays node `.test.ts`. Add **visual-regression** (Playwright screenshots) as a gate.

**✅ Checkpoint:** the full stack runs end-to-end; client component + e2e tests green; the UI-boundary physics hold (an app→raw-primitive import fails to resolve).

---

## Cross-cutting (every phase)
- **Tests travel with code** — each new file's test lands at its mirror path or `check` goes red (`test-mirror` + `test-presence`).
- **Owned risks, no action** (`CHECKLIST §E`): the Qwen3-VL single-model concentration (cosine≈1.0 probe guards it); single-replica is the v1 stance (every `ASSUMES(single-replica)` site has a named DB-backed replacement seam).
- **The verification method that works** (keep using it): general-purpose agents reading whole files + a grep sweep for losing-side strings after any structural change.
