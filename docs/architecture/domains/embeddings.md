# Orbweaver — `embeddings`: the vector substrate (the one write path)

> **Status: planning (authoritative detail).** `embeddings` is a **NEW** domain with no neo-tavern
> analogue — it is the consolidation of 6 hand-rolled vector write sites scattered across 5 tables into
> one owned mechanism. It is a **shared mechanism, not a row-owner-by-feature**: producers write
> THROUGH it; rows stay FK'd to their producer. Authoritative upstream: `knowledge-cluster.md` (the
> canonical substrate design, invariants, and the producer→store→consumer model); `domains.md`
> §"embeddings" + §"The knowledge / derived-data untangle"; `_FANOUT-BRIEF.md` §4 (embeddings pain
> ledger); `structure.md` §4 (the 8-slot template). `tiers/providers.md` §2b is the canonical
> source for the space invariant (embed model = space = comparable-within).

---

## What this domain owns

- **The single vector write path** — `embeddings.store(kind, lens, key, content, model)` is the ONLY
  function that inserts a vector row into any of the four primary vector tables. Every producer writes
  through it; no other domain ever inserts directly into `character_embeddings`, `image_embeddings`,
  `chat_digests`, or `chat_segments`.
- **The four primary vector tables** — `character_embeddings`, `image_embeddings`, `chat_digests`,
  `chat_segments` (and the `chat_digest_speakers` join). These schemas are defined in
  `@orb/db/schema/embeddings.ts` — the producer, not the consumer, names the schema file (fixes the
  neo-tavern schema-naming lie where all four lived in `db/schema/search.ts`).
- **The `hub_score` column** — present on all four primary tables; written ONLY by `discovery` (via the
  `embeddings.writeHubScores` helper exposed for that purpose); read by `search` ranking. A vector
  write through `embeddings.store` MUST NOT null it (the advisory-stale invariant — §11 invariant 5).
- **The `content_hash` column** — on all four tables; computed from source content; is the staleness
  gate (re-embed iff hash changed) and the cross-chat collapse key (identical content from fork/import
  collapses to one hit, not N).
- **The `(model, dim)` space tag** — every row is tagged with its embed model + dimension. `search`
  and `memory` compare only within one space. The active embed model is an explicit setting in
  `connection`; changing it to a different `(model, dim)` triggers the re-index workload.
- **The embed role dispatcher** — `embeddings` wires the `embed` role call (via `connection`'s
  `resolveRole('embed')`) and calls `infra/providers`'s sealed `embed` role impl. The domain
  speaks user-vocab only (no runner/family knowledge); the role dispatcher in `infra/providers` owns
  the `switch (credential.source)` logic.
- **The VECTOR_TABLES registry** — a compile-time–typed tuple of the four primary table names; consumed
  by the `clearVectorTable` helper and by tests. Moves from `db/vector-ops.ts` (a db-layer artifact) to
  `embeddings/contract/` (its natural owner).
- **The `clearVectorTable` helper** — a thin, type-safe `DELETE FROM` over the typed table union. The
  comment explaining why it is safe (no ANN/DiskANN shadow index) is load-bearing. Moves from
  `db/vector-ops.ts` to `embeddings/persistence/`.
- **The `hub_score` write helper** — `writeHubScores(table, updates[])`: the narrow seam through which
  `discovery` updates hub scores without directly touching `embeddings` persistence. A batch `UPDATE`
  keyed on `(id, model)` against the right table. This is the one write-surface exposed to a non-owner
  domain.

This domain does **not** own: the embed model's execution (that is `infra/providers`'s sealed `embed`
backend impl); the `theme_clusters` or `digest_theme_assignments` tables (those are `discovery` rollup
tables, not primary vector stores); the retrieval/read path over these tables (that is `search`); the
content itself (produced by `memory` for digests/segments, by `character` for card text, by `assets` for
avatar images); the CSLS hub-score computation (that is `discovery`); the per-chat recall policy (that
is `memory`).

---

## The defining invariant (locked)

> **`embeddings.store(kind, lens, key, content, model)` is the only inserter into any vector table.**

This kills the 6-site tangle neo-tavern recon confirmed:

- `corpus/service.ts` — two near-identical embed+upsert paths (single and batch character cards)
- `corpus/verbs/embed-images.ts` — image slice embed+upsert
- `corpus/themes/generate.ts` — theme centroid write (k-means output, NOT an `embed()` call — but the
  table is now correctly owned by `discovery`, not `embeddings`)
- `chat/memory/db.ts` — `embedAndUpsert` for digests (150-line function conflating embed call + vector
  write + FK stamping + speaker sync)
- `chat/memory/generate.ts` — segment embed+upsert

In orbweaver:

- `memory` calls `embeddings.store(kind='chat-block', lens='digest', ...)` and separately handles its
  own FK stamping (chatId/scopedCharacterId/isGroup — **NO `ownerId`**, D20: the vector substrate FKs to its
  producer and never denormalizes ownership; owner-scope is derived at search time from membership) + speaker
  sync as domain writes AFTER the vector row exists.
- `character` emits a `character.updated` event; the `embeddings` indexer (the event subscriber)
  calls `embeddings.store(kind='card', lens='card-text', ...)`.
- `assets` emits an `asset.created` event; the indexer calls `embeddings.store` for both lenses:
  `image-raw` and `image-captioned`.
- `memory` calls `embeddings.store(kind='chat-block', lens='segment', ...)` for verbatim blocks.

**The hub_score reset bug is eliminated here.** Neo-tavern: `chat/memory/db.ts` and
`chat/memory/generate.ts` null `hub_score` on every vector write (two copy-pasted sites);
`corpus/service.ts` correctly leaves it advisory-stale (different policy, already right). Orbweaver:
`embeddings.store` NEVER touches `hub_score` — the column is only written by `discovery` through the
dedicated `writeHubScores` helper. One policy, one site.

---

## Source kinds and lenses

| Source kind  | Lens              | Table                  | Triggered by                                                                        |
| ------------ | ----------------- | ---------------------- | ----------------------------------------------------------------------------------- |
| `card`       | `card-text`       | `character_embeddings` | `character.updated` event                                                           |
| `avatar`     | `image-raw`       | `image_embeddings`     | `asset.created` event                                                               |
| `avatar`     | `image-captioned` | `image_embeddings`     | `asset.created` event (caption generated inline in `embeddings/indexer`, ledger §2) |
| `chat-block` | `segment`         | `chat_segments`        | `memory` post-turn build, import backfill                                           |
| `chat-block` | `digest`          | `chat_digests`         | `memory` post-turn build, import backfill                                           |

All lenses land in the **one 1024-dim space** (Qwen3-VL, text↔image cosine comparable). Image-raw
embeds carry no text influence (pure visual signal); image-captioned embeds combine the image bytes +
caption string (joint VL). `search` selects which lens to query; the lens choice controls text influence
on the result.

**`content_hash` as staleness gate:** `embeddings.store` computes or accepts a `content_hash` of the
content. If an existing row for the same `(kind, lens, key, model)` has an identical hash, the call is
a no-op (no re-embed, no write). `character_embeddings` must gain a `content_hash` column (neo-tavern
uses `sourceText` comparison — a divergence from the other tables that is a recon-confirmed pain). In
orbweaver ALL four tables have `content_hash`.

---

## The 8-slot layout

```
domain/embeddings/
├── index.ts                    FRONT DOOR — the only legal external import
├── service.ts                  COMPOSITION ROOT — wires the indexer + injected deps. ZERO logic.
├── context.ts                  DI BUNDLE — explicit EmbeddingsContext interface (not ReturnType<>)
├── contract/
│   ├── service.ts              EmbeddingsService interface — read this to know everything the domain does
│   ├── params.ts               StoreParams, WriteHubScoresParams, ClearTableParams, VectorTable type,
│   │                           VECTOR_TABLES registry (moves from db/vector-ops.ts)
│   ├── results.ts              StoreResult (noop|written), WriteHubScoresResult (rowsUpdated)
│   ├── views.ts                (minimal — embeddings has no client-facing read surface of its own)
│   └── errors.ts               EmbedFailedError, SpaceMismatchError
├── verbs/
│   ├── store.ts                store(kind, lens, key, content, model) — the single write path
│   │                           (hash-check → embed → upsert; never nulls hub_score)
│   └── write-hub-scores.ts     writeHubScores(table, updates[]) — the discovery→embeddings write seam
├── persistence/
│   ├── queries.ts              upsertVector(table, row) + existingHash(table, key, model) per table
│   └── clear.ts                clearVectorTable(table) — DELETE FROM (safe: no ANN shadow index)
├── substrate/
│   └── hash.ts                 contentHash(content: string | Uint8Array): string
│                               — SHA-256 hex; the one implementation (was scattered: db/vector-ops,
│                               chat/memory, corpus/service each had inline variants)
└── indexer/                    NAMED SUBSYSTEM — the event-driven subscriber
    ├── index.ts                createEmbeddingsIndexer(ctx): EmbeddingsIndexer
    ├── handlers.ts             onCharacterUpdated, onAssetCreated — each calls embeddings.store via
    │                           ctx; debounced/coalesceable. (No onDigestCreated/onSegmentCreated:
    │                           `memory` calls `embeddings.store` directly for digests/segments — ledger §2)
    └── types.ts                EmbeddingsIndexer interface (the event subscription shape)
```

**Named subsystem: `indexer/`** — the event-driven subscriber that receives `character.updated` /
`asset.created` domain events and dispatches to `embeddings.store`. This is distinct from the `store`
verb (which is called directly by `memory` synchronously post-turn for digests/segments — `memory`
emits no digest/segment events, ledger §2). The indexer is the async/bulk path; `memory` uses `store` via the injected op
(synchronous post-turn, already on the right async boundary because it is itself post-turn
fire-and-forget).

**No `subsystems/` for themes:** `theme_clusters` is a `discovery` table, not owned here. The centroid
write (`corpus/themes/generate.ts:351`) is correctly a `discovery` persistence concern in orbweaver.

---

## Verbs (the `EmbeddingsService` interface)

```typescript
EmbeddingsService = {
  // The single write path
  store(params: StoreParams): Promise<StoreResult>
  // params: { kind: SourceKind; lens: SourceLens; key: string; content: string | Uint8Array;
  //           model: string; dim: number; fkRefs?: FkRefs }  (NO ownerId — D20: producer FK only)
  // FkRefs: { characterId?, chatId?, assetId?, scopedCharacterId?, tier?, blockIdx?, seqStart?, seqEnd? }
  // Result: { outcome: 'noop' | 'written'; contentHash: string }

  // discovery write seam — the ONLY non-store write
  writeHubScores(params: WriteHubScoresParams): Promise<WriteHubScoresResult>
  // params: { table: VectorTable; updates: { id: string; model: string; hubScore: number }[] }

  // Maintenance
  clearTable(params: ClearTableParams): Promise<void>
  // params: { table: VectorTable }
}
```

**`store` owns the full upsert shape including `fkRefs`** — the FK references (chatId, assetId, etc.)
are supplied by the caller (the producer knows them); `embeddings.store` stamps them onto the row. This
keeps the FK-stamping concern split: embeddings writes the FK columns; memory handles its own domain
joins (speaker sync, scopedCharacterId logic) AFTER the upsert confirms a row id via the return value.

**`writeHubScores` is intentionally narrow** — it takes the pre-computed scores as data; it does no
CSLS math. The computation is `discovery`'s; the write is `embeddings`'s. This enforces the seam:
discovery computes, embeddings stores, search reads.

**`clearTable`** replaces the test+bootstrap helper that lived in `db/vector-ops.ts`. Same semantics
(a plain `DELETE FROM`, safe without an ANN shadow), now owned by the domain that owns the tables.

---

## Public surface (`index.ts`)

```typescript
// Errors
export { EmbedFailedError, SpaceMismatchError } from "./contract/errors";

// Service types
export type {
  EmbeddingsService,
  EmbeddingsContext,
  EmbeddingsServiceDeps,
} from "./contract/service";

// Vector table registry (consumed by discovery and tests)
export type { VectorTable } from "./contract/params";
export { VECTOR_TABLES } from "./contract/params";

// Indexer (wired at entry)
export { createEmbeddingsIndexer } from "./indexer";
export type { EmbeddingsIndexer } from "./indexer/types";

// Factory
export { createEmbeddingsService } from "./service";
```

**`StoreParams` / `StoreResult` / `WriteHubScoresParams`** are domain-internal input/output shapes;
they live in `contract/params.ts` and `contract/results.ts` and are NOT re-exported from the front
door. Callers that inject `embeddings.store` through the composition root receive the function directly
and do not need the param types at call sites (type inference handles it).

**Cross-boundary types** (`EmbedRequest`, `EmbedResult`) live in `@orb/contracts/providers` (the
provider-result group, Rule 10) — these are the `infra/providers` role-contract types consumed by the
sealed embed backend impls. The domain
imports them from `@orb/contracts`, not from `infra/`.

---

## Movement table

| Unit                                                                                                                                 | Outcome                 | Target                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                                                                                                                                       | Enforcement tier                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `corpus/service.ts:embedAndStore` + `embedAndStoreMany`                                                                              | merge → domain feature  | `domain/embeddings/verbs/store.ts`                                                                                                                                                                         | Two near-identical bodies collapse into the one parametrized write path. Auth guard (ownership check) is handled by the caller at composition root; not baked into the store verb.                                                                                                                                                                                                              | resolve-time: old `corpus/service.ts` bodies are gone; any call site fails to resolve                                                                                                                                               |
| `corpus/verbs/embed-images.ts` (image slice+batch+upsert)                                                                            | → domain feature        | `domain/embeddings/indexer/handlers.ts:onAssetCreated`                                                                                                                                                     | The image embed logic becomes the indexer's asset-created handler; `store` is called per lens (`image-raw`, `image-captioned`). `EmbedImagesPassOptions` (inline in the verb file) moves to `domain/embeddings/contract/params.ts`.                                                                                                                                                             | resolve-time: old verb file removed; compile-time: `EmbedImagesPassOptions` is no longer inline in a verb (`no-inline-types` gate)                                                                                                  |
| `chat/memory/db.ts:embedAndUpsert` (the embed half only)                                                                             | → domain feature        | `domain/embeddings/verbs/store.ts` (embed+upsert) + `chat/memory/persistence/` (FK stamping + speaker sync)                                                                                                | `embedAndUpsert` conflates the vector write mechanism with memory's domain FK stamps. Split: `store` handles vector; `memory` handles its remaining writes post-store.                                                                                                                                                                                                                          | resolve-time: `embedAndUpsert` removed; compile-time: the FK-stamp + speaker-sync path re-expressed as memory-persistence calls                                                                                                     |
| `chat/memory/generate.ts:generateSegments` (the embed call)                                                                          | → domain feature        | `embeddings.store` called from within the `memory` build path                                                                                                                                              | `memory`'s segment embed is a call to `embeddings.store`; the segment build logic stays in `memory`.                                                                                                                                                                                                                                                                                            | resolve-time (injection model)                                                                                                                                                                                                      |
| `chat/memory/db.ts:393` + `generate.ts:388` — `hub_score = null` resets                                                              | **deleted**             | —                                                                                                                                                                                                          | The two-site null-reset is the neo-tavern bug. `embeddings.store` never touches `hub_score`; the column is advisory-stale by design. Corpus already had the right policy; memory must match it.                                                                                                                                                                                                 | compile-time: `hub_score` is not a field in `StoreParams`; no code path from `store` touches that column                                                                                                                            |
| `db/vector-ops.ts:clearVectorTable`                                                                                                  | → domain feature        | `domain/embeddings/persistence/clear.ts` (verb is `EmbeddingsService.clearTable`)                                                                                                                          | The helper belongs to the domain that owns the tables, not the db layer. The load-bearing "safe: no DiskANN shadow index" comment is carried verbatim.                                                                                                                                                                                                                                          | resolve-time: `db/vector-ops.ts` is removed; consumers (tests, bootstrap) import from `domain/embeddings` front door                                                                                                                |
| `db/vector-ops.ts:VECTOR_TABLES` + `VectorTable`                                                                                     | → domain feature        | `domain/embeddings/contract/params.ts`                                                                                                                                                                     | The typed table registry belongs to the domain that owns the tables, not the db layer. Consumers (tests, `discovery`, `search`) import from `domain/embeddings/index.ts`.                                                                                                                                                                                                                       | resolve-time: same as above                                                                                                                                                                                                         |
| `providers/embed.ts:embed(req)` (role dispatcher)                                                                                    | → `infra/providers`     | `infra/providers/roles/embed.ts` (sealed impl per backend) + `domain/embeddings` calls it via the injected role op                                                                                         | The dispatcher is an infra concern (`switch (credential.source) → backend impl`). `embeddings` imports the role contract (`EmbedRequest` / `EmbedResult`) from `@orb/contracts`, not from `infra/`. The domain calls the role via an injected dep, never the backend directly.                                                                                                                  | resolve-time: `domain/embeddings` does not declare `infra/providers` as a package dep; the injected op type comes from `@orb/contracts`                                                                                             |
| `providers/_shared/vector-math.ts` (pairwiseCosine, cosineToMany, cosineDistance, cosineSim, l2Normalize, mean)                      | → `@orb/kit`            | `@orb/kit/vector-math`                                                                                                                                                                                     | Pure math primitives (zero I/O, zero domain); 5+ consumer files in domain/corpus and domain/chat/memory reach directly into `providers/_shared/` — a domain→infra-internal violation. As a `kit` module all consumers import cleanly from a proper home.                                                                                                                                        | resolve-time: `providers/_shared/vector-math.ts` is removed from `infra/providers`; `@orb/kit/vector-math` is the declared dep for any consumer needing cosine/l2norm                                                               |
| `corpus/substrate/pair-cosine.ts` (hand dot-loop)                                                                                    | → `@orb/kit`            | `@orb/kit/vector-math` (consolidated with pairwiseCosine)                                                                                                                                                  | A second hand-rolled cosine implementation. Fold into the kit math module so there is one implementation.                                                                                                                                                                                                                                                                                       | resolve-time: `pair-cosine.ts` is removed; dep-cruiser `kit-purity` gate ensures the kit module has zero I/O deps                                                                                                                   |
| `corpus/verbs/hubness.ts:computeCharacterHubScores` / `computeDigestHubScores` / `computeSegmentHubScores` / `computeImageHubScores` | → `domain/discovery`    | `domain/discovery/verbs/compute-hub-scores.ts` (per-kind verbs) + writes via injected `embeddings.writeHubScores`                                                                                          | Hubness computation is a `discovery` concern (a semantic ranking signal); the write target (`hub_score` column) is `embeddings`'s. Hubness lives in `discovery`; it calls the `embeddings.writeHubScores` helper through the composition-root injection, never touching persistence directly.                                                                                                   | resolve-time: `corpus/verbs/hubness.ts` is removed; `discovery` front door re-exports the hub-score verbs; lint-time: dep-cruiser `domain-no-cross-feature` prohibits `discovery` from importing `embeddings/persistence/` directly |
| `db/schema/search.ts` — `character_embeddings`, `image_embeddings`, `chat_digests`, `chat_segments`, `chat_digest_speakers`          | rename/move             | `@orb/db/schema/embeddings.ts`                                                                                                                                                                             | Schema-naming lie: all four primary vector tables + the speaker join were in a file named for the consumer. In orbweaver the producer names the schema. The memory producer's domain-stamped columns (`chatId`, `scopedCharacterId`, `isGroup`, `tier`) stay on the same tables; schema ownership transfers.                                                                                    | compile-time: the old file is gone; any import of the old path fails `tsc`                                                                                                                                                          |
| `db/schema/search.ts` — `chat_digests.characterVersionId` (CASCADE FK to `character_versions`)                                       | **dropped (D28)**       | the column does not exist in orbweaver                                                                                                                                                                     | Today FKs to `character_versions` via CASCADE (a chat-pinning artifact). D28 deletes the version table outright, and digest scoping already moved to `chat_digest_speakers.characterId` (D25). The column had no remaining reader — it is dropped entirely, not retained as a stamp.                                                                                                            | compile-time: `chat_digests` has no `characterVersionId` column and `character_versions` does not exist; any reference fails `tsc`                                                                                                  |
| `EmbedImagesPassOptions` (inline in `corpus/verbs/embed-images.ts:44`)                                                               | → domain feature        | `domain/embeddings/contract/params.ts`                                                                                                                                                                     | Options type for the image embed pass is a contract input shape; its result type (`EmbedImagesPassStats`) was already correctly in `corpus/contract/results.ts`. Co-locate both in `embeddings/contract/`.                                                                                                                                                                                      | lint-time: `no-inline-types` gate                                                                                                                                                                                                   |
| `corpus/service.ts:embedAndStore` ownership guard                                                                                    | → caller responsibility | Callers supply the **producer FK refs** (`chatId`/`characterId`/`assetId`) in `StoreParams`; the `embeddings` domain never stamps OR re-checks ownership (D20 — no denormalized `ownerId` on a vector row) | Ownership is enforced at the producer level (character/assets/memory own their content rows) and owner-SCOPE is derived at search time from the producer (membership for chat digests, `characters.ownerId` for character embeds, caller's asset-usage for images); the store verb is a pure mechanism.                                                                                         | compile-time: `StoreParams` carries the producer FK, **no `ownerId`/`userId`/auth param**; lint: `vector-scope-derived` (no raw vector read outside `search`; scope before rank/collapse)                                           |
| `character_embeddings.sourceText` staleness key                                                                                      | → `content_hash`        | Add `content_hash` column; drop `sourceText` as staleness key                                                                                                                                              | Divergence from the other three tables which use `content_hash`. In orbweaver ALL four tables use `content_hash`. `character_embeddings` gains the column in the migration.                                                                                                                                                                                                                     | compile-time: `StoreParams.content` is the content; `store` computes the hash; no `sourceText` param exists                                                                                                                         |
| `chat_digest_speakers` join (embeddings-managed)                                                                                     | stays domain feature    | `@orb/db/schema/embeddings.ts` (moves with the other four) + `domain/embeddings/persistence/queries.ts` (speaker sync after upsert)                                                                        | The speaker join syncs after a digest upsert. In orbweaver `memory` calls `embeddings.store` for the vector write and then calls a `memory`-owned persistence helper to sync speakers; OR the `store` verb accepts a `speakers?: CharacterId[]` in `fkRefs` and handles the sync internally. Lean: accept speakers in `fkRefs` — keeps the upsert+speaker-sync atomic and avoids a double-trip. | compile-time: `fkRefs.speakers` typed on `StoreParams`; the speaker sync is inside `store`, not split across domains                                                                                                                |

---

## Cross-feature composition (the injection model)

`embeddings` is called by `memory`, `character` (indirectly, via the indexer), `assets` (indirectly,
via the indexer), `discovery` (for `writeHubScores`), and `search` (indirectly — `search` reads the
tables directly via `@orb/db`; it does not call `embeddings` verbs). No domain imports
`domain/embeddings` internals — all access is through the front door or through the composition-root
injected ops.

**Injected into `memory.context` at the composition root:**

| Op injected        | Provided by       | Used for                                                                                            |
| ------------------ | ----------------- | --------------------------------------------------------------------------------------------------- |
| `embeddings.store` | embeddings domain | post-turn digest + segment vector write (replaces `embedAndUpsert` + `generateSegments` embed call) |

**Injected into `discovery.context` at the composition root:**

| Op injected                 | Provided by       | Used for                                                                      |
| --------------------------- | ----------------- | ----------------------------------------------------------------------------- |
| `embeddings.writeHubScores` | embeddings domain | writing CSLS hub scores back to vector table rows after the computation batch |

**Event subscriptions (wired in `entry/`):**

| Event               | Subscriber                                          | Calls                                                     |
| ------------------- | --------------------------------------------------- | --------------------------------------------------------- |
| `character.updated` | `embeddings/indexer/handlers.ts:onCharacterUpdated` | `embeddings.store(kind='card', lens='card-text', ...)`    |
| `asset.created`     | `embeddings/indexer/handlers.ts:onAssetCreated`     | `embeddings.store` twice: `image-raw` + `image-captioned` |

Memory does NOT emit events for its digest/segment builds; it calls `embeddings.store` directly
(synchronously within its own post-turn fire-and-forget path). The indexer is for the
character+asset paths where the write is truly event-triggered (a save in a different feature).

**`search` and `discovery` read tables via `@orb/db` directly** (expected — they are bulk readers
without business-logic concerns; reading `@orb/db` schema from a domain is permitted). They do NOT call
any `embeddings` verb for reads.

---

## Spine thread intersections

### `knowledge-cluster.md` (primary)

`embeddings` is the store described in §1 of `knowledge-cluster.md`. Every design decision in that doc
about the substrate (content_hash, hub_score-advisory, space-tied-to-model, ONE write path, FK rows
staying with producer) is the invariant this domain must uphold. Specifically:

- **§0 invariants:** substrate is a pure function of canon (never a second source of truth); build
  never blocks the reply (the `store` verb is always called from a post-turn or indexer context).
- **§1:** the space is `(model, dim)`-tagged; same model on different backends = same space = free
  switch (no re-index). Changing model triggers the re-index workload (a `workloads` concern, not an
  `embeddings` concern — `embeddings` is stateless about model choice; the caller supplies `model` in
  `StoreParams`).
- **§8 seam:** `embeddings` owns the column; `discovery` computes; `search` reads; vector write never
  nulls. Enforced by `StoreParams` having no `hubScore` field.

### `tiers/providers.md` §2b (embed space invariant)

The `(model, dim)` space tag and the OR `dimensions` param compatibility (same Qwen model on vLLM
or OpenRouter → same 1024-dim MRL-truncated space, verified by cosine probe at switch time) are a
`connection` + `infra/providers` concern. `embeddings` is agnostic — it stamps whatever `(model, dim)` the
caller supplies. The setting that declares the active embed model lives in `connection`; the probe lives
in `infra/providers`'s embed backend initialization.

### §7.4 types and schemas — one home, one direction

- `VECTOR_TABLES` tuple + `VectorTable` union type → `domain/embeddings/contract/params.ts` (domain
  owns its table registry). Re-exported from the front door for `discovery` and tests.
- `StoreParams` / `StoreResult` / `WriteHubScoresParams` / `ClearTableParams` →
  `domain/embeddings/contract/params.ts` + `contract/results.ts` (domain-internal).
- `EmbedRequest` / `EmbedResult` (the infra role contract) → `@orb/contracts/providers` (cross-boundary:
  `domain/embeddings` produces the call, `infra/providers/roles/embed.ts` consumes it as a sealed impl).
- `EmbedImagesPassOptions` (moved from inline verb file) → `domain/embeddings/contract/params.ts`.
- `EmbeddingsContext` → explicit named `export interface EmbeddingsContext` in `context.ts` (not
  `ReturnType<>`).
- The four table schemas (`character_embeddings`, `image_embeddings`, `chat_digests`, `chat_segments`,
  `chat_digest_speakers`) → `@orb/db/schema/embeddings.ts` (db-layer row types derived here; no
  domain-level re-export of raw row types).

### §7.5 string-union dispatch discipline

`SourceKind` (`'card' | 'avatar' | 'chat-block'`) and `SourceLens` (`'card-text' | 'image-raw' |
'image-captioned' | 'segment' | 'digest'`) are the two dispatch axes in `StoreParams`. Homes:

- The broad `SourceKind`/`SourceLens` (the dispatch axes) → ONE importable canonical union in
  `domain/embeddings/contract/params.ts` (no inline re-spelling).
- **The image subset `IMAGE_LENSES` (`'image-raw' | 'image-captioned'`) → `@orb/contracts/embeddings` (D34)**
  — it constrains the `image_embeddings.lens` db column, and `@orb/db` cannot import a `domain/*/contract`.
  `IMAGE_LENSES` is the non-duplicated image subset of `SourceLens` (not a second spelling); the
  `image_embeddings.lens` column + `unique(assetId, model, lens)` are owned here in embeddings' schema.
  Both must also have:
- A mapped-type record or `assertNever` exhaustive dispatch inside `store.ts` so a new kind/lens is a
  `tsc` error unless the table routing is also added.

The `VectorTable` union (`'character_embeddings' | 'image_embeddings' | 'chat_digests' | 'chat_segments'`)
follows the same rule — one tuple/union, `assertNever` on any new arm.

### §8.5 knowledge cluster (grounded recon)

The recon confirmed all 6 write sites. Two specific load-bearing esoteric details that the domain doc
must preserve:

1. **`scopedCharacterId` empty-string sentinel** (`chat_digests`): the SHARED bucket uses `''` (empty
   string) as `scopedCharacterId`, NOT NULL. SQLite UNIQUE constraints do not deduplicate NULL values;
   `''` makes the idempotent-upsert unique index work on `(chatId, scopedCharacterId, tier, blockIdx)`.
   `StoreParams.fkRefs.scopedCharacterId` must carry this sentinel through; `store.ts` MUST NOT coerce
   `''` to NULL. This invariant is a load-bearing comment in `store.ts`.

1b. **Image embeddings are owner-scoped via the owned asset (ledger D21/D20).** Assets are per-user now, so an
`image_embeddings` row FKs an owned asset; image-similarity search scopes to `assetId ∈ {the caller's
   assets}` — a scan never returns another user's blob. No `ownerId` on the vector row (the scope derives
from the owned asset, D20). `image_embeddings` is no longer a global space.

1. **`hub_score` on `image_embeddings` is reserved for image↔image use only.** CSLS hub scores are
   computed for image embeddings but MUST NOT be used for text→image retrieval (cross-modal cosine
   scale mismatch: image↔image ~0.6–1.0 vs text→image ~0.05–0.17; applying CSLS to text→image rankings
   empirically inverts them). The `search` domain deliberately omits `hub_score` from text→image
   queries. If `embeddings.writeHubScores` is called for `image_embeddings`, the column is written and
   advisory-stale — `search` is responsible for not reading it on the text→image path. This constraint
   belongs as a comment on the `hub_score` column definition in `@orb/db/schema/embeddings.ts`.

2. **HUBNESS_DENSE_MAX streaming path** (`corpus/verbs/hubness.ts:133–175`): above 5000 same-type
   vectors the all-pairs N×N matrix (~100MB at N=5000) cannot be materialized. This threshold logic
   belongs in `discovery`'s hub-score verb (NOT in `embeddings`), but `embeddings.writeHubScores` must
   handle batches of any size (it is a bulk UPDATE, not a matrix op). The dense-vs-streaming path is
   entirely a `discovery` concern.

3. **`chat_digest_speakers` re-query after upsert** (`chat/memory/db.ts:441–483`): the upsert may keep
   an existing digest's ID (conflict resolution); the inline `newTypeId()` value can't be trusted for
   the speaker FK writes. If speaker sync is inside `store.ts` (recommended), the store verb must
   re-query the real row id after upsert before writing speaker rows. The re-query uses
   `(chatId, scopedCharacterId, tier, blockIdx)` — ALL four columns, including `scopedCharacterId`. If
   the `scopedCharacterId` filter is dropped, a scoped bucket's speaker rows bleed into the shared
   bucket.

4. **`digestGenerationInFlight` + `segmentGenerationInFlight` Sets** (in-process duplicate-spend
   guards, `chat/memory/generate.ts:47`) are `memory`'s concern, not `embeddings`'s — they guard the
   summarizer call, not the vector write. They carry `ASSUMES(single-replica)` and must stay in
   `memory`. `embeddings.store` is idempotent (hash-gated upsert); it is safe to call twice; the
   duplicate-spend guard is about the expensive summarizer, not the store.

---

## Invariants (gate candidates)

1. **`embeddings.store` is the only vector inserter** — no other domain executes an `INSERT INTO`
   against `character_embeddings`, `image_embeddings`, `chat_digests`, or `chat_segments`.
   _Enforcement: lint-time (dep-cruiser rule: no domain other than `embeddings` may import
   `@orb/db/schema/embeddings` in a write context; compile-time: schema tables are not exported from
   any other domain's persistence layer)._

2. **`store` never touches `hub_score`** — the column is absent from `StoreParams` and from the upsert
   statement in `persistence/queries.ts`.
   _Enforcement: compile-time — `StoreParams` has no `hubScore` field; `tsc` rejects any attempt to
   pass it. Additionally a unit test asserts the upserted row's `hub_score` is unchanged after a
   `store` call on an existing row._

3. **`writeHubScores` is the ONLY path that writes `hub_score`** — `discovery` calls it; no other
   verb or persistence function updates the `hub_score` column.
   _Enforcement: lint-time (dep-cruiser: the only `hub_score` write is in
   `domain/embeddings/persistence/queries.ts`, callable only from `verbs/write-hub-scores.ts`)._

4. **All four primary tables have `content_hash`** — no table uses a raw content string as its
   staleness key.
   _Enforcement: compile-time — `content_hash NOT NULL` is in the schema DDL; a migration that drops it
   fails `tsc` (Drizzle schema type would lose the column)._

5. **`scopedCharacterId = ''` sentinel is preserved** — the empty-string shared bucket is never coerced
   to NULL.
   _Enforcement: test-time — a contract test inserts a shared-bucket digest (scopedCharacterId='') and
   a scoped-bucket digest (scopedCharacterId=characterId) and asserts both upsert idempotently with no
   collision._

6. **`VECTOR_TABLES` is the single registry of primary vector tables** — no code hardcodes the table
   name as a string outside `domain/embeddings/contract/params.ts`.
   _Enforcement: compile-time — `VectorTable` is a branded string union; `clearTable` and
   `writeHubScores` accept `VectorTable`, not `string`; a new table requires adding to `VECTOR_TABLES`
   or `tsc` rejects the call._

7. **`embeddings` imports `infra/providers` only through the injected role op** — the domain has zero
   direct imports from `infra/providers/` (vLLM is nested at `infra/providers/vllm/`, per §7 D7).
   _Enforcement: resolve-time (package dep: `@orb/server` does not declare `infra/providers` as an
   intra-package import target for `domain/embeddings`; dep-cruiser backstop: `domain-no-infra-direct`
   rule)._

8. **`SourceKind` and `SourceLens` unions are exhaustively dispatched** — a new member fails the build.
   _Enforcement: compile-time — `store.ts` uses a `satisfies never` or `assertNever` in the switch
   default; `embeddings/store.ts` (§7.5) owns the exhaustive lens→table map._

---

## Open decisions

- **Speaker sync placement** — `fkRefs.speakers` in `StoreParams` (atomic, one round-trip) vs `memory`
  calls a separate `memory/persistence/speakers.ts` helper post-store (simpler store verb, one extra
  trip). Lean: accept `speakers` in `fkRefs`; the atomicity benefit outweighs the wider param.
- **Event system** — the indexer subscribes to domain events; the orbweaver event bus shape
  (in-process EventEmitter vs a typed bus) is an `entry/` concern not yet decided. The indexer's
  `handlers.ts` is agnostic; it receives the event payload shape from `@orb/contracts/events`.
- **Re-index workload trigger** — when the active embed model changes (a `connection` setting), a
  `workloads` job re-embeds the corpus. That workload calls `embeddings.store` in bulk. The trigger
  is a `connection` → `workloads` concern; `embeddings` is a passthrough.
- **`image-captioned` caption source** — the caption is produced by the vLLM `summarize` role (or a
  hosted model). The indexer's `onAssetCreated` handler must obtain the caption before calling
  `store(..., 'image-captioned', ...)`. Options: (a) the handler calls `summarize` inline (blocking but
  scoped); (b) a `caption.created` event chains after `asset.created`. Lean: (a), caption is fast
  enough; (b) adds an extra event hop with no clear benefit.
- **`content_hash` for binary image content** — SHA-256 of the raw bytes. Verify the hash of the
  resized/sliced bytes (not the original blob) matches between the `image-raw` and `image-captioned`
  rows, so both lenses for the same asset share a `content_hash` and de-duplicate on re-index.
- **`image_embeddings` hub-score UI** — today search deliberately omits `hub_score` on text→image
  paths. When image↔image similarity browsing is added (the reserved use case), the search verb for
  that path explicitly opts in to reading `hub_score`. This is a `search` + `discovery` decision at
  build time; `embeddings` just stores the column.

# --- Merged from knowledge-cluster ---

## 0. The spine: build once, read many

There is **one substrate of embedded content, built once, stored once**, and **many read-only
consumers**. Nothing re-embeds or re-stores for its own use.

```
                         ┌──────────────── embeddings (the store) ────────────────┐
   canon writes ──emit──▶│ ONE vector store · ONE write path · ONE 1024-dim space  │
   (chat turn / import /  │ source kinds: chat SEGMENT · chat DIGEST · character    │
    character save /      │ CARD · avatar IMAGE. content_hash + hub_score columns.  │
    avatar upload)        └───────────┬────────────────────────────────────────────┘
                                      │ read-only
        ┌─────────────────────────────┼──────────────────────────────┐
        ▼                            ▼                               ▼
     search                       memory                         discovery
   the retrieval ENGINE       the BUILDER + chat-scoped         library SEMANTICS
   (scope × lens × rerank)    RECALL policy (calls search)      (themes/hubness/dup/
   over the whole store       → fills {{memory}}                 distill) + hub_score
```

**Two hard invariants (everything else follows):**

1. **The substrate is a pure function of canon.** It is a derived index, never a second source of
   truth. Any row can be deleted and rebuilt from `messages` alone. This is what keeps the
   "enabled-later" roadmap (§9) free, makes edits/forks safe, AND makes mode-switching loss-free (§4).
2. **Build never blocks the reply.** Substrate construction runs _after_ a turn commits
   (fire-and-forget) or in bulk backfill — never on the send hot path.

---

## 1. `embeddings` — the store (a shared mechanism, not a row-owner-by-feature)

Owns the **one vector store, the single write path, and the one embedding space**. Producers write
THROUGH it; it is the only code that inserts a vector.

- **Space is a tagged variable (NOT a single pin) — tied to the MODEL, not the backend.** The embed
  _model_ defines the space `(model, dim)`. Every vector is tagged with it; `search`/`memory` compare
  **only within one space**. **Same model on different backends = same space = FREE switch** (Qwen-1024
  on vLLM or OpenRouter — flip local↔hosted, no re-index). **A different model/dim is its own space →
  dump + re-index workload** — a rare, deliberate, set-and-leave change, never a per-turn knob.
  Text↔image cosine works only inside a joint multimodal space (Qwen, vLLM _or_ OpenRouter); a CPU CLIP
  image embed is its own space. (Full detail: `tiers/providers.md` §2b.)
- **The single write API:** `embeddings.store(kind, lens, key, content, model, …)` → embeds + upserts.
  Kills the 6 hand-rolled write sites recon found. A source `kind` carries **multiple lenses** + the
  per-lens facets the lens needs (so `search`/`memory` can read them without a second table):
  - `chat-block` → **`segment`** (the verbatim `text` + seq-span) · **`digest`** (the distilled `text` +
    `topicAnchor` + `keywords` + `tier`, the §2 facets)
  - `avatar` → **`image-raw`** (pure image, NO caption) · **`image-captioned`** (image **+** description)
  - `card` → **`card-text`** (one lens)

  All lenses live in the **one 1024-dim space** (cosine-comparable); the _lens you search_ controls
  whether text influences the result.

- **Staleness + collapse key — `content_hash`** (one column, two jobs, both verified necessary):
  - _Staleness:_ re-derive a row iff its `content_hash` changed. It folds the seq-span content **and the
    stable speaker `characterId` and the scope** (§4) — so a re-attribution or a mode-switch correctly
    invalidates, and same-words/different-speaker blocks don't falsely collapse. Name-INDEPENDENT
    (renames/persona switches don't bust it; genuine re-attribution does).
  - _Cross-chat collapse:_ fork/import copies with identical content collapse to one hit in search +
    one rep in all-pairs analytics (so a forked scene counts once).
- **`hub_score` column** — a _search ranking_ signal **computed by `discovery`** (CSLS), stored here,
  read by `search`. **A vector write must NOT null it** (the neo-tavern reset-in-3-places bug). Advisory-
  stale by design; discovery recomputes it on its own cadence.
- **Rows stay FK'd to their producer** (a digest row → `chats`, cascade-safe). NO `ownerId` on the
  digest/segment rows — owner DERIVES via the chat FK (D20). NO `characterVersionId` (D28 de-pin) — so
  orbweaver never faces neo's feared `NOT NULL cv` full-table rebuild; the speaker identity lives in
  `scopedCharacterId` (§4) + `chat_digest_speakers`, not a cv stamp.

---

## 2. The substrate shape — two lenses per block

Every chat is sliced into fixed **`blockSize`-message blocks**. Each _completed, aged-out_ block is
captured through **two complementary lenses**, both embedded, both pointing back to the same
`(chatId, blockIdx, seq-span)`. **Both lenses store their `text`** (the verbatim transcript / the
distilled digest) — the diagram and ST both store it, and the cross-chat read returns text directly
rather than re-reading N chats' canon per hit.

### 2a. SEGMENT — the verbatim lens

The raw transcript of the block, **stored (`text`) + embedded**. The ground truth a digest hit resolves
back to. Keyed `(chatId, blockIdx)`. Every complete block, all chats.

### 2b. DIGEST — the distilled lens (structured, NOT prose)

A retrieval-optimized unit produced under a strict prompt with **three mandatory parts**, all folded
into the stored `text` (and the anchor + keywords also kept as separate retrieval facets):

1. **Topic anchor** — mandatory first line, `[entities — scene]`.
2. **Significance-filtered facts** — litmus: _"will this matter later?"_ (drop turn-by-turn noise).
3. **15–30 concrete keywords** — distinctive retrieval anchors (named entities, specifics).

Keyed `(chatId, scopedCharacterId, tier, blockIdx)` (the scope key — §4; `scopedCharacterId` is a real
`CharacterId`, never a sentinel). Embedded. The _sharp_ search key (a raw block embeds noisily —
everything looks like "two people talking"; the distilled anchor+facts+keywords retrieve cleanly). The
stored `text` is **what fills `{{memory}}`** AND what is embedded.

> **Why both, not either:** ST embeds verbatim XOR a lossy summary (its Vector Storage vs Summarize
> extensions are two separate systems). We keep both, permanently linked — digest = the sharp key + the
> distilled readable text injected into `{{memory}}`; segment = the verbatim text it resolves to.

---

## 8. Ownership & boundaries (summary)

| Concern                                                                                               | Owner                                    |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| vector store, single write path, one space, `content_hash`, `hub_score` column                        | **embeddings**                           |
| substrate build (summarizer: block→segment+digest+tier; group-aware; self-heal; fork-lazy; host-only) | **memory**                               |
| `{{memory}}` recall policy (scope=chat, window, mode, bridge-pool, assembly, mode-switch)             | **memory** (calls search)                |
| the retrieval engine (vector: scope×lens×rerank; membership-gated cross-chat; + lexical BM25)         | **search**                               |
| themes/hubness/dup/distill + computes `hub_score`                                                     | **discovery**                            |
| turn economics                                                                                        | **stats** (separate; zero vector tables) |

Every cross-domain access goes through a real boundary (`embeddings.store` / `search` / `memory.recall`)
— never one domain reaching into another's tables.

---

## 11. Invariants (the things a gate should protect)

1. Substrate is a **pure function of canon** — never a second source of truth.
2. Build **never blocks the reply** (post-commit / backfill only).
3. **One embedding space** (one model/dim); **one write path** (`embeddings.store`).
4. **One retrieval engine** (`search`) — memory + discovery call it, never reimplement cosine. Memory
   holds **zero cosine + zero vector-write**.
5. `hub_score` is **never nulled by a vector write**.
6. **Scoped recall is egocentric-only** (within a scoped era): the active speaker's own witnessed bucket;
   a switched chat additionally reads the shared bucket for its merged/narrator eras (§4).
7. `discovery` (semantics) and `stats` (economics) **share no tables**; discovery computes no usage
   rollup.
8. **`scopedCharacterId` is always a real `CharacterId`** (no `''` sentinel, no NULL); solo / merged-
   narrator / scoped all key uniformly (§4).
9. **Memory build + recall run under `runAsUserId` (host-only)**, never `triggeredBy` / the member.
10. **Trigger discipline:** recall does not embed on an empty pool; build issues no summarizer call when
    no block has aged out — a fresh chat does zero memory/embed work.
11. **The scope/speaker is folded into `content_hash`** — a mode-switch or re-attribution invalidates the
    affected digests; mode-switching is recall-handled (shared ∪ own-witnessed), never an eager re-digest.
12. **The witnessing predicate is the join/leave horizon** (`joinSeq`/`leftSeq`), never the global
    `excludedFromPrompt` boolean.

> **See also:** [embeddings.md](embeddings.md) · [memory.md](memory.md) · `domain/search` (code) · [discovery.md](discovery.md)
