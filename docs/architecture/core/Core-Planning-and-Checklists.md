# Planning-and-Checklists

> Auto-generated from reorg manifest.

---

<!-- Source: Core-Planning-and-Checklists.md -->

## Orbweaver — pre-scaffold checklist (implementation-time conditions)

> **Status: the gate between planning and scaffolding.** These are the council's conditions that are
> _implementation acts_, not doc edits — each must be done at the indicated point in the build. Doc-level
> decisions are committed in `Core-Laws-and-Precedents.md §5`; this file is the operational "do these or the
> architecture's guarantees don't hold." Ordered by when they bite.

<!-- Source: Core-Planning-and-Checklists.md -->

## A. Before the first domain compiles (with the packages)

<!-- Source: Core-Planning-and-Checklists.md -->

### A1. The gate suite is day-one and BLOCKING ⭐ (skeptic's #1)

The boundary scan proves the cake is clean _today_; nothing keeps it clean but gates that don't exist
yet, and everything _inside_ `server` is dep-cruiser (tier 3), not resolver-physics. Stand up, WITH the
5 packages and before the first domain:

- The 13 gates (`core/Core-0-Architecture-and-Structure.md §7`) as real dep-cruiser + biome rules + `tsc` patterns.
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

<!-- Source: Core-Planning-and-Checklists.md -->

### A2. Reserve the AI-native seams (cheap, do at scaffold) (visionary)

Already committed in the docs; ensure the _code_ honors them at scaffold:

- `@orb/contracts/memory`: type `ClipKind`, `ClipSourceKind`, `clip.scope` (even with zero behavior).
- `WorkloadKind` union: reserve `'world-state'` with a stub runner (keeps `exhaustive-dispatch` green).
- When the `chat_participants.kind` agent-split lands: include an `'observer'` kind.
- Keep search's cross-chat character scope + the `character_stats → characters → character_summaries` JOIN path open.

<!-- Source: Core-Planning-and-Checklists.md -->

### A3. Local-light embed/rerank tier = a v1 build target (product seat's one risk)

Schedule the transformers.js/ONNX in-process backend (CPU+CUDA) as a sealed strategy in
`infra/providers/backends/` in the same wave as the other embed backends — NOT a "later" item. Without
it, a GPU-less, cloud-key-less user has no working memory search + no reranking, and the "strict
superset" claim fails. (`core/Tier-3b-Providers.md §2b`.)

<!-- Source: Core-Planning-and-Checklists.md -->

### A4. Stand up `tests/support/` with the gate suite (testing day-one)

The fixture doctrine is referenced everywhere but nothing exists to import yet. Build it WITH the gates,
before the first domain test: the composed `test.extend` (`tests/support/fixtures.ts` → `freshDb`,
frozen `clock`, seeded `ids`, a seeded user, the composed services with the model scripted), `freshDb`
(migrated libSQL `:memory:`), and the first factories. Wire the Vitest node projects — `unit` (`.test`),
`integration` (`.int.test`), `contract` (`.contract.test`), `types` (`.test-d.ts`), `parity` (`.parity.test`,
opt-in) — in ONE `vitest.config.ts` via `test.projects`, plus the `test-presence` + `test-determinism`
gates, into `check`. **Browser lanes are Playwright, not Vitest** (Vitest browser hangs): scaffold
`playwright-ct.config.ts` (`.ct.tsx` component) + `playwright.config.ts` (`.spec.ts` e2e) as separate
runners, NOT in the fast `check`. Full policy: `core/Spine-Testing.md`.

<!-- Source: Core-Planning-and-Checklists.md -->

## B. Before / during the DB + migrations build

<!-- Source: Core-Planning-and-Checklists.md -->

### B1. Write the migration data scripts (not just the schema outcomes) (ops)

- **`proposedTags → character_tags.status`** (neo→orb data port): for each neo
  `character_versions.proposedTags` array element upsert a `character_tags` row (`source='card'`,
  `status='pending'`, create the tag if needed). Orbweaver has no `proposedTags` column anywhere (D28 +
  `domain/tag`). Add a post-migration count-validation query. Without this, existing pending-tag data is
  silently lost on the port.
- **`character_books` land on `characters.id`** (D28; neo keyed books on the cv): when porting, add a
  pre-flight orphan check (neo `LEFT JOIN character_versions … characters WHERE characters.id IS NULL`);
  log + drop orphans as a documented, observable event rather than an FK crash or silent loss. Orbweaver's
  `character_books.characterId` references `characters.id` directly (no cv exists).
- **Card-content port** (D28): neo's `character_versions` card columns land on the FLAT orbweaver
  `characters` row (no version table); per-character stats group on `characters.id`. Orbweaver is born
  without `chats.characterVersionId` / `currentVersionId` / a version table — there is no "de-pin"
  migration, just a flat-row write. Run the port's content + stats-grouping steps in one pass so
  `assertReferentialIntegrity` sees a consistent graph.
- **WI persona-book join**: rewire `pool.ts` from `chats.personaId` to `chat_participants.activePersonaId`
  BEFORE dropping `chats.personaId`.
- **`image_embeddings.lens`**: adding the discriminator needs a re-embed workload to populate `image-raw`
  (treat existing rows as `image-captioned`); document the upgrade path.
- **Per-migration `PRAGMA foreign_keys=OFF`** on the migration connection only; `assertReferentialIntegrity`
  (`PRAGMA foreign_key_check`) post-migration is the only FK gate → `backupBeforeMigrate` is non-optional.

<!-- Source: Core-Planning-and-Checklists.md -->

### B2. `.credentials-key` data-loss prevention (ops's #2 footgun)

- Boot decrypt-probe: after loading the key, attempt to decrypt the first credential row; on failure log
  ERROR + surface a `credentials_key_mismatch` field in `healthz`.
- A stdout boot line: "CREDENTIALS_KEY loaded from .credentials-key — back this file up alongside your DB."
- (The GCM AAD `${userId}|${provider}` belt makes the key the ONLY recovery path; losing it is permanent.)

<!-- Source: Core-Planning-and-Checklists.md -->

## C. The chat + memory build (LAST — highest risk)

<!-- Source: Core-Planning-and-Checklists.md -->

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
  cache placement + token tallies). **Memory is a rewrite** — it intentionally produces _different_
  retrieval; it can't be byte-diffed. Memory gets its OWN tests (the 6-semantics map),
  not the oracle.

<!-- Source: Core-Planning-and-Checklists.md -->

### C2. The ~150 "preserve exactly" esoterica → named tests (skeptic #6)

Each domain/tier doc's "Esoteric / load-bearing" notes are correctness documentation that a
from-structure rebuild silently drops. Each becomes a named test or an asserted invariant. The
load-bearing comments that must travel with the code: the AAD byte-string, ZWSP-between-the-braces
(`neutralizeMacros`), `scopedCharacterId=''` sentinel, the PNG dual-chunk + CRC, the vLLM death-couple
pipe-watchdog, `storedVersion`-beats-probe, the last-owner / owner-immutability guard EXISTS-on-UPDATE (D17), the `globalMacroRegistry`
single-tenant note, the `deepMergeRequestBody` Layer-2 defense, the `ASSUMES(single-replica)` annotations.

<!-- Source: Core-Planning-and-Checklists.md -->

### C3. The unified roster / group / multi-human system is built WHOLE (ledger D16)

**No feature-phasing** — there is no solo-then-multihuman split (neo's Phase A/B is a retrofit artifact, not
carried). The chat build delivers the entire system cohesively. Build obligations, each → a named test:

- **Schema born whole (Phase 4c/db):** `chat_participants` lifecycle (`joinSeq`/`leftSeq`/`joinHistoryVisibility`/
  `talkativeness`/`disabled`/`role` + `(chatId,userId)` UNIQUE + the XOR CHECK), `chat_invites`, `pending_turns`,
  the `messages` SLOT + `message_variants` content split (slot-level attribution, NOT on the variant — D26), the
  `notifications` table (NEW `notifications` domain), `chats.metadata`.
- **neo's §9 security must-dos → tests:** host-wallet abuse (per-member COUNT budget across ALL backends, attributed to
  `triggeredBy`, debited in-lock); **max-pro-sub-by-proxy refused** unless owner consent (D17); server-stamp
  `authorUserId` + sanitize member content (the trusted speaker label after all regex); host-only room overrides; host-
  approved cross-user WI; invite hardening (hashed CSPRNG token, atomic `maxUses` redeem, server-forced `member`);
  server-derived presence (never client-asserted); bus payload allowlist (credentials type-level-unrepresentable).
- **neo's §10.4 cross-cutting invariants → tests:** `no-if(isGroup)` solo-byte-identical; the turn-identity TRIPLE;
  `computeHistoryBreakpoint` undefined for multi-responder/narrator tails; AI-authored `@mention` never forces a speaker;
  presence→cast snapshot pinned once per round; narrator authored by the group character (never NULL).
- **The owner role split (D17):** `UserRole = owner|admin|user`; `requireOwner` gates the `max-pro-sub` mint + admin
  grant; owner-immutability / last-owner guard; the local-compute owner-box knobs (count budget + concurrency + throttle).
- **The oracle covers PARITY only** — the multi-human/group/invite/notification/presence/arbitration surfaces are
  intentional rewrites (not diffable); they ship with `.int`/`.contract` tests, not the differential oracle (C1).
- **A group/multi-human fixture** for the int suite (a roster with ≥2 humans + ≥2 characters, an invite, a kick, a
  host-handoff, a narrator round + a per-speaker round, a scoped-memory room) lands with the oracle fixture (C1).

<!-- Source: Core-Planning-and-Checklists.md -->

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

<!-- Source: Core-Planning-and-Checklists.md -->

## E. Owned risks (no action — documented acceptance)

- **Qwen3-VL single-model dependency** at the knowledge-cluster core (matching MRL-1024 + L2-norm across
  vLLM/OpenRouter). The cosine≈1.0 probe guards it; if it fails, "free local↔hosted switch" → a re-index.
  Acceptable for the stated product; owned, not mitigated. (`core/Tier-3b-Providers.md §2b`.)
- **Single-replica** is the v1 stance (honest + cleanly seamed — every `ASSUMES(single-replica)` site has
  a named DB-backed replacement). Scaling out = replacing ~12 surfaces; not a v1 concern.
- **Deferred features** (acceptable): agent-principal mint mechanics, BYO response-mapping form, bulk/zip
  library export, the 4 AI-native v2 swings (seams reserved).

<!-- Source: Core-Planning-and-Checklists.md -->

## Orbweaver — greenfield council review (2026-06-25)

> A 5-seat panel each read the ENTIRE doc set in full (no grep) and ruled on whether to sign off before
> scaffolding. **Outcome: unanimous conditional sign-off. No blocks.** This is the durable record of the
> verdicts, the converged conditions, and the big ideas. The committed decisions live in
> `Core-Laws-and-Precedents.md §5`; the implementation-time conditions in `Core-Planning-and-Checklists.md`.

<!-- Source: Core-Planning-and-Checklists.md -->

## Verdicts

| Seat                  | Model  | Verdict                      | Headline                                                                                                                                                                                                              |
| --------------------- | ------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Architecture Skeptic  | Opus   | SIGN-OFF w/ conditions       | "Most disciplined greenfield plan I've reviewed" — intra-server boundaries are _lint, not physics_ until the gates exist                                                                                              |
| AI-Native Visionary   | Sonnet | sound, missing the big swing | "Builds a superb substrate and only **retrieves** from it; the 2026 move is to **synthesize**"                                                                                                                        |
| Executability / DX    | Sonnet | can-scaffold-with-fixes      | 8/11 gates real; 5 pre-scaffold blockers (mostly stale "Open"s the ledger already decided) _(dated verdict — the gate ladder was since finalized at the canonical **13**, `Core-0-Architecture-and-Structure.md` §7)_ |
| Production / Ops      | Sonnet | SIGN-OFF w/ conditions       | single-replica is honest + cleanly seamed; gaps are missing _migration scripts_ + _failure surfaces_                                                                                                                  |
| Product / RP-fidelity | Sonnet | PRODUCT-COMPLETE             | genuine strict-superset (12 wins over ST); one real v1 risk (local-light embed tier)                                                                                                                                  |

<!-- Source: Core-Planning-and-Checklists.md -->

## Converged conditions (multiple seats agreed) — all now actioned

1. **Gate suite day-one, blocking** (skeptic). → DECIDED (ledger §5); the _how_ is `Core-Planning-and-Checklists.md`.
2. **Differential oracle is a noun, not a procedure; can't validate memory (a rewrite)** (skeptic + ops). → runbook + fixture spec in `Core-Planning-and-Checklists.md`.
3. **v1 authority-model scope was ambiguous** (skeptic + product). → DECIDED: participant-membership in v1; agent-principal mint deferred (ledger §5).
4. **Stale "Open"s the ledger already closed** (executability). → PURGED (foundation DEFAULT_MODEL, credentials factory, domains.md hub_score/serde/bulk/stats, infra oidc note).
5. **Promote the `contracts/` boot-DAG + add embeddings/search to the leaf order** (executability). → DONE (ledger §4).

<!-- Source: Core-Planning-and-Checklists.md -->

## Resolved in docs (Bucket 1 + 2)

- Stale "Open"s purged (above). `core/Tier-5-Entry.md` written (the composition root had no home — skeptic #5).
- `contracts/` boot-DAG + embeddings/search leaf-order → ledger §4.
- AI-native **seam reservations** added (ClipKind/ClipSourceKind/scope; `'world-state'` WorkloadKind; `'observer'` participant kind note; cross-chat scope + stats↔discovery JOIN kept open).
- Decisions committed in ledger §5: v1 authority, local-light = v1 prereq, the 4 swings = reserve-now/build-v2, the `can()` interface, the two gate-formats, the Qwen3-VL concentration risk (owned).

<!-- Source: Core-Planning-and-Checklists.md -->

## The big AI-native swings (the "mega-cool" — grounded in existing seams; v2)

1. **World-state as a third substrate kind** — `{{world_state}}` macro + a reconciling workload (relationship/inventory/plot, _what is currently true_). Seam: `knowledge-cluster §9` trackers/clips + `embeddings.store(kind,…)`.
2. **The Narrative Director** — generalize buddy's observe→propose→confirm to a per-chat observer agent that detects drift and proposes WI/steering (never acts). Seam: buddy pattern + guided steering + `smart-arbitrate` + WI verbs.
3. **Cross-chat character coherence** ("persistent self") — synthesize character-level traits from cross-chat digests. Seam: de-pin (identity-keyed) + search's cross-chat character scope.
4. **Engagement-aware preset recommendation** — discovery facets + stats engagement → connection. Pure v2.

The thesis: the architecture builds a superb knowledge substrate and retrieves from it; the swing is to _synthesize_ from it. Budget to keep the swings free = ~5 type declarations + 2 union reservations (done).

<!-- Source: Core-Planning-and-Checklists.md -->

## Implementation-time conditions (→ `Core-Planning-and-Checklists.md`)

Gate suite day-one; the oracle runbook+fixture; migration scripts (proposedTags data migration, character_books orphan pre-flight, stats-regroup atomicity); `.credentials-key` boot-probe + warning; fire-and-forget memory-build failure surface; the ~150 "preserve exactly" esoterica → named tests; SSE subscription error-wrapper; `VLLM_DISABLED`; `custom-byo contextWindow`; the local-light embed/rerank tier as a v1 prerequisite.

<!-- Source: Core-Planning-and-Checklists.md -->

## Notable wins the council validated (vs SillyTavern)

Tiered memory + cross-chat vector search (5 modes, 2 lenses, CSLS + rerank + BM25) · the rolling-PAIR cache breakpoint (ST pattern + neo's safe-boundary aborts) · per-agent connection · the dynamic capability-descriptor params panel · `runOnEdit` wired · 4-scope world-info · the buddy agent w/ propose-confirm gate · character de-pin + snapshot/restore · proposed-tags round-trip fixed · fully-user-declared BYO backend · import auto-indexes · the single canonical typed card. **The "strict superset" claim holds — conditional on the local-light tier shipping in v1.**
