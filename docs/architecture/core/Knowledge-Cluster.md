---
kind: law
status: active
updated: 2026-08-18
---

# Knowledge cluster — the producer → store → consumer boundary

> The cross-domain boundary map for the derived-data cluster: `embeddings` · `search` · `discovery` ·
> `chat/memory` (+ the `stats` fence). BUILT — the per-domain semantics live in the code and its file
> headers; this doc carries only the multi-domain seam no single file shows. Domain map:
> `AGENTS.md` §6; decision record: ledger D55.

One substrate of embedded content, built once, stored once, read by many. It is a **pure function of
canon** (any row deletes and rebuilds from `messages`/`characters`/`assets` alone — never a second source
of truth), and **building it never blocks a reply** (post-commit fire-and-forget or backfill). The seam
exists because neo-tavern had 6 hand-rolled vector-write sites across 5 tables and 4 ranking
implementations with no owner.

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
   (+ `writeHubScores`, inv 3). Producers (card/avatar/digest) are *lens arms* of `store`, never inserters;
   the VERBATIM segment lens is the one BATCH arm (`storeSegments`, #172) because its producer holds the whole
   corpus's work at once and a block over the embed window becomes N chunks — same persistence file, same hash
   gate, same space tripwire, one embed flood instead of one awaited embed per block. `content_hash` is the
   staleness gate: identical hash ⇒ `noop` before the embed runs.
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
6. **One space per `(model, dim)` tag.** Compare only within a space: store-time dim tripwire
   (`SpaceMismatchError`) + compare-time kit dim-throw. Same model on a new backend = same space;
   a new model/dim = a re-index workload.

Recall semantics (the 5 modes, tiered bridge, witnessing, egocentric scoping, the two windows, host-only
execution, trigger discipline) are carried in full by the `chat/memory` code headers
(`recall/recall.ts` et al.) + ledger D55 — not restated here.

`document_chunks` (the databank RAG table) is WRITTEN today (databank landed 2026-07-26, D107 Phase B):
`domain/databank/ingest` stores each chunk via the injected `embeddingsStore` op, and the physical insert
lives in `embeddings/persistence/queries.ts` — the single write path held, no carve-out needed
(truth-audit correction 2026-08-03; this line previously said "ZERO writers today").
