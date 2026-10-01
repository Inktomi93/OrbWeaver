---
kind: law
status: active
updated: 2026-10-01
---

# Knowledge cluster — the producer → store → consumer boundary

> The cross-domain boundary map for the derived-data cluster: `embeddings` · `search` · `discovery` ·
> `chat/memory` (+ the `stats` separation). The per-domain semantics live in the code and its file
> headers; this doc carries only the multi-domain seam no single file shows. Domain map:
> `Constitution.md` §6; decision record: ledger D55.

One substrate of embedded content, built once, stored once, read by many. It is a **pure function of
canon** (any row deletes and rebuilds from `messages`/`characters`/`assets` alone — never a second source
of truth), and **building it never blocks a reply** (post-commit fire-and-forget or backfill).

## Ownership

| Concern | Owner | Home |
| - | - | - |
| vector tables + the ONE write path + `content_hash` + the `(model, dim)` space tag + the `hub_score` column | `embeddings` | `domain/embeddings` · `db/schema/embeddings.ts` |
| top-k retrieval (cosine scan × scope × rerank; owner-scope DERIVED, D20) | `search` (read-only) | `domain/search` |
| digest/segment GENERATION + the `{{memory}}` recall policy (chat-scoped) | `chat/memory` (a `chat/` subsystem, sealed behind `chat`) | `domain/chat/memory` |
| library semantics: themes/hubness/duplicates; COMPUTES `hub_score` | `discovery` | `domain/discovery` · `db/schema/discovery.ts` |
| turn economics (zero vector tables) | `stats` | `domain/stats` · `db/schema/stats.ts` |

## Invariants (cross-domain — gate-protected)

1. **ONE vector write path.** Every insert/update on the six vector tables (`character_embeddings` ·
   `image_embeddings` · `chat_digests` · `chat_segments` · `chat_digest_speakers` · `document_chunks` —
   the set the `vector-scope-derived` gate pins) lives in
   `embeddings/persistence/queries.ts`, reached only via `embeddings.store` / `embeddings.storeSegments`
   (+ `writeHubScores`, inv 3). Producers (card/avatar/digest) call `store`; they never insert directly.
   `store`'s params are discriminated by kind, and `segment` is deliberately not one of its cases:
   `storeSegments` is the one batch path, for the verbatim segment producer, because that producer holds
   a whole corpus's work at once and a block over the embed window becomes N chunks — same persistence
   file, same hash gate, same space tripwire, one embed flood (one call per owner) instead of one
   awaited embed per block. `content_hash` is the staleness gate: identical hash ⇒ `noop` before the
   embed runs.
2. **Two cosine access patterns, two owners — never mixed.** Top-k retrieval = `search` only (the
   `vector_distance_cos` SQL appears solely in `search/persistence/`). All-pairs in-RAM analytics =
   `discovery` only (`@orb/kit/vector-math.pairwiseCosine`). `memory` holds ZERO cosine of either kind —
   it delegates the scan to the injected `searchDigests` op (wired at `entry/compose/chat.ts`). Note:
   discovery does NOT call `search` in the built slice — analytics is not retrieval.
3. **The `hub_score` seam:** `discovery` computes the values (`verbs/compute-hub-scores.ts`) →
   `embeddings.writeHubScores` performs the write (the ONLY non-`store` vector-table write) → `search`
   reads it (`cslsAdjust`). A vector write (`store`) NEVER sets or nulls `hub_score` — the column is
   nullable, never defaulted, advisory-stale by design.
4. **Schema is named for its producer.** Vector tables live in `db/schema/embeddings.ts` (moved out of
   the neo `schema/search.ts` lie); discovery's rollups in `schema/discovery.ts`. The consumer never
   names the file.
5. **`discovery` (semantics) and `stats` (economics) share no tables.** Stats has zero vector columns
   (the `stats-no-vector-tables` dep-cruiser rule); discovery computes no usage rollup.
6. **Compare only compatible encoder generations and widths.** Store-time `SpaceMismatchError` and
   compare-time dimension checks reject incompatible vectors. Model names alone do not establish compatibility;
   the connection fingerprint and effective width rules live in `Tier-3b-Providers.md` §9.

Recall semantics (the 5 modes, tiered bridge, witnessing, egocentric scoping, the two windows, host-only
execution, trigger discipline) are carried in full by the `chat/memory` code headers
(`recall/recall.ts` et al.) + ledger D55 — not restated here.

`document_chunks` (the databank RAG table) is written: `domain/databank/ingest` (D107 Phase B) stores each
chunk via the injected `embeddingsStore` op, and the physical insert lives in
`embeddings/persistence/queries.ts` — the single write path holds, no carve-out needed.

## Seed vectors and live indexing

Default-content vectors enter through the injected lookup in `embeddings.store`. A hit requires matching content hash, embedding kind and resolved local-light space. Normal generation resolution, width validation and upsert still apply. Other wires use their live encoders.

Image indexing and captioning follow `EMBEDDABLE_ASSET_KINDS` in `packages/contracts/src/assets/index.ts`. Events and sweeps share preparation and coalesce work before captioning or embedding. Reclaim disallowed image vectors without deleting the original assets.

Automatic indexing reads effective configuration when scheduling work. Enabling indexing runs the existing catch-up path; disabling it prevents new automatic work. Seed a missing image-embedding binding through the existing local connection, preserving every existing binding, including explicit null opt-outs.

## Derived retrieval and transcript sources

Room-derived retrieval requires current host membership (D16/D20). Character ownership grants no room authority. Search applies this scope before ranking and collapse.

Corpus and Scenes retrieve indexed transcript segments independently of digest candidates. A segment keeps its own source identity when no digest credits its block.

Source identity retains the row, generation, fingerprint, content hash, and producer span. Chat resolves transcript destinations through authorized canon and history projection.

Stable message endpoints supplement producer sequence spans. Readers resolve those endpoints instead of calculating message positions from block indices.

The memory bridge projects only stored digest block identities. Standalone transcript search does not invent a memory perspective.
