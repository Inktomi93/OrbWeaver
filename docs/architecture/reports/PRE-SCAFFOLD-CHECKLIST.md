# Orbweaver — pre-scaffold checklist (implementation-time conditions)

> **Status: the gate between planning and scaffolding.** These are the council's conditions that are
> *implementation acts*, not doc edits — each must be done at the indicated point in the build. Doc-level
> decisions are committed in `DECISIONS-LEDGER.md §5`; this file is the operational "do these or the
> architecture's guarantees don't hold." Ordered by when they bite.

## A. Before the first domain compiles (with the packages)

### A1. The gate suite is day-one and BLOCKING ⭐ (skeptic's #1)
The boundary scan proves the cake is clean *today*; nothing keeps it clean but gates that don't exist
yet, and everything *inside* `server` is dep-cruiser (tier 3), not resolver-physics. Stand up, WITH the
5 packages and before the first domain:
- The 11 gates (`structure.md §7`) as real dep-cruiser + biome rules + `tsc` patterns.
- The bespoke domain rules named across the docs: `domain-no-cross-feature` (exempt `entry/` only),
  `drivers-through-domain` (transport imports front doors only), `assets-single-writer`,
  `discovery-no-vector-write`, `stats-no-vector-tables`, `persistence-no-io`,
  `persistence-no-in-memory-state`, `infra-no-db`, `no foundation→infra/domain`, `kit-purity`
  (no `node:*`/contracts/db/domain), the `ASSUMES(single-replica)` annotation presence check,
  `serde-core` single-mapper.
- A blocking `check` wired into **pre-commit + CI**, and (since agents are the only authors) ideally a
  **PreToolUse hook** that runs the relevant gate on edit. "A named-but-unwritten gate is prose."
- Gate-format decisions are committed (ledger §5): `no-inline-union-redecl` = self-registering via
  `as const satisfies` (measured axes only); `no-inline-types` exemption glob pinned.

### A2. Reserve the AI-native seams (cheap, do at scaffold) (visionary)
Already committed in the docs; ensure the *code* honors them at scaffold:
- `@orb/contracts/memory`: type `ClipKind`, `ClipSourceKind`, `clip.scope` (even with zero behavior).
- `WorkloadKind` union: reserve `'world-state'` with a stub runner (keeps `exhaustive-dispatch` green).
- When the `chat_participants.kind` agent-split lands: include an `'observer'` kind.
- Keep search's cross-chat character scope + the `character_stats → characters → character_summaries` JOIN path open.

### A3. Local-light embed/rerank tier = a v1 build target (product seat's one risk)
Schedule the transformers.js/ONNX in-process backend (CPU+CUDA) as a sealed strategy in
`infra/providers/backends/` in the same wave as the other embed backends — NOT a "later" item. Without
it, a GPU-less, cloud-key-less user has no working memory search + no reranking, and the "strict
superset" claim fails. (`tiers/providers.md §2b`.)

### A4. Stand up `tests/support/` with the gate suite (testing day-one)
The fixture doctrine is referenced everywhere but nothing exists to import yet. Build it WITH the gates,
before the first domain test: the composed `test.extend` (`tests/support/fixtures.ts` → `freshDb`,
frozen `clock`, seeded `ids`, a seeded user, the composed services with the model scripted), `freshDb`
(migrated libSQL `:memory:`), and the first factories. Wire the four Vitest projects
(`.test`/`.int.test`/`.contract.test`/`.parity.test`) and the `test-presence` + `test-determinism` gates
into `check`. Full policy: `spine/testing.md`. (The `.parity` project stays opt-in — see §C1.)

## B. Before / during the DB + migrations build

### B1. Write the migration data scripts (not just the schema outcomes) (ops)
- **`proposedTags → character_tags.status`**: in the SAME migration that drops the JSON column, for each
  `character_versions.proposedTags` array element upsert a `character_tags` row (`source='card'`,
  `status='pending'`, create the tag if needed). Add a post-migration count-validation query. Without
  this, existing pending-tag data is silently lost on migrate.
- **`character_books` re-key** (cv → `characters.id`): add a pre-flight orphan check
  (`LEFT JOIN character_versions … characters WHERE characters.id IS NULL`); log + drop orphans as a
  documented, observable event rather than a mid-migration FK crash or silent loss.
- **stats regroup** (`cv.character_id → characters.id`) and the **character de-pin** (drop
  `chats.characterVersionId`) migrations must be in the SAME or adjacent files (no transactional gap) —
  else `assertReferentialIntegrity` aborts the chain on the window.
- **WI persona-book join**: rewire `pool.ts` from `chats.personaId` to `chat_participants.activePersonaId`
  BEFORE dropping `chats.personaId`.
- **`image_embeddings.lens`**: adding the discriminator needs a re-embed workload to populate `image-raw`
  (treat existing rows as `image-captioned`); document the upgrade path.
- **Per-migration `PRAGMA foreign_keys=OFF`** on the migration connection only; `assertReferentialIntegrity`
  (`PRAGMA foreign_key_check`) post-migration is the only FK gate → `backupBeforeMigrate` is non-optional.

### B2. `.credentials-key` data-loss prevention (ops's #2 footgun)
- Boot decrypt-probe: after loading the key, attempt to decrypt the first credential row; on failure log
  ERROR + surface a `credentials_key_mismatch` field in `healthz`.
- A stdout boot line: "CREDENTIALS_KEY loaded from .credentials-key — back this file up alongside your DB."
- (The GCM AAD `${userId}|${provider}` belt makes the key the ONLY recovery path; losing it is permanent.)

## C. The chat + memory build (LAST — highest risk)

### C1. The differential-oracle runbook + fixture ⭐ (ops's "one thing")
Write BEFORE reaching the chat scaffold (discovering it's a multi-day stand-up at that point is the worst
time). It must specify:
- How to run the steady clone (`/tmp/neo-tavern-steady`) against a fixture DB.
- The fixture: a minimal chat + character + preset snapshot exercising all RESOLVE→GATHER→BUILD→SHAPE
  stages incl. the rolling-pair breakpoint, group/scoped recall, guided steering.
- How to capture + store SEND/ASSEMBLE/RECEIVE outputs from the neo-tavern pipeline (the
  `scripted-override.ts` RUNNER_OVERRIDE seam makes RECEIVE deterministic — script the model).
- The numeric assertion: what "same cache-token counts" means (cacheWrite/read deltas), where
  `pipeline-breakpoint.test.ts` lives in the orbweaver test tree.
- **The honest caveat (skeptic):** the oracle byte-validates the PARITY surface (assembled-prompt +
  cache placement + token tallies). **Memory is a rewrite** — it intentionally produces *different*
  retrieval; it can't be byte-diffed. Memory gets its OWN tests (the 6-semantics map in `domains/chat.md`),
  not the oracle.

### C2. The ~150 "preserve exactly" esoterica → named tests (skeptic #6)
Each domain/tier doc's "Esoteric / load-bearing" notes are correctness documentation that a
from-structure rebuild silently drops. Each becomes a named test or an asserted invariant. The
load-bearing comments that must travel with the code: the AAD byte-string, ZWSP-between-the-braces
(`neutralizeMacros`), `scopedCharacterId=''` sentinel, the PNG dual-chunk + CRC, the vLLM death-couple
pipe-watchdog, `storedVersion`-beats-probe, the last-admin EXISTS-on-UPDATE, the `globalMacroRegistry`
single-tenant note, the `deepMergeRequestBody` Layer-2 defense, the `ASSUMES(single-replica)` annotations.

## D. Failure-surface + ops hardening (during the relevant domain builds)

- **D1. Fire-and-forget memory build needs a failure surface** (ops): import returns the enqueued
  workload IDs (client can poll the existing SSE); any terminal-failed workload emits
  `logAudit('WORKLOAD_FAILED', {kind, id, error})` at ERROR. Else a half-failed bulk import leaves cards
  invisible to memory search with no signal. PLUS: a `content_hash`-diff **catch-up sweep** as the
  REQUIRED event-bus reliability backstop (the substrate is a pure function of canon → free) — not the
  event path's nice-to-have (skeptic #4).
- **D2. SSE subscription error-wrapper** (ops): subscription generators bypass `domainErrorMiddleware`;
  wrap each to emit a typed `{type:'error'}` event + log ERROR on throw (else silent disconnect + frozen UI).
- **D3. `VLLM_DISABLED=true` startup escape hatch** (ops): one `if` in the supervisor boot; prevents a
  restart-loop from hammering a misconfigured vLLM. (Breaker state is in-memory; resets on restart.)
- **D4. `custom-byo contextWindow?`** field (ops + product): add to the `CustomOpenAiCredential` profile
  (fallback 128k) so a BYO 2M-context model isn't budgeted to 128k. The BYO **response-mapping schema**
  (content/usage/finish/stream field map) also needs finalizing before the BYO form ships.
- **D5. `APP_SETTINGS_RELOADED` audit line** (ops): log the new effective `logLevel` after
  `reloadEffectiveConfig` so a failed hot-reload is observable.

## E. Owned risks (no action — documented acceptance)
- **Qwen3-VL single-model dependency** at the knowledge-cluster core (matching MRL-1024 + L2-norm across
  vLLM/OpenRouter). The cosine≈1.0 probe guards it; if it fails, "free local↔hosted switch" → a re-index.
  Acceptable for the stated product; owned, not mitigated. (`tiers/providers.md §2b`.)
- **Single-replica** is the v1 stance (honest + cleanly seamed — every `ASSUMES(single-replica)` site has
  a named DB-backed replacement). Scaling out = replacing ~12 surfaces; not a v1 concern.
- **Deferred features** (acceptable): agent-principal mint mechanics, BYO response-mapping form, bulk/zip
  library export, the 4 AI-native v2 swings (seams reserved).
