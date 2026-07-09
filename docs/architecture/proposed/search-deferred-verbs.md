---
kind: spec
status: draft
updated: 2026-07-03
---

# Proposed — `search`: the deferred verb set (PD-35 · PD-36 · PD-37 · PD-38)

> Gap doc from gutting `domains/search.md` (built domain; code is truth). The BUILT surface —
> `knn` / `findCharacters` / `digests` / `segments` / `corpus`, CSLS + rerank + dedupe substrate,
> the scope belts — is documented by `packages/server/src/domain/search/` headers + tests. This doc
> carries ONLY the genuinely-unbuilt design so it survives the doc's deletion. Each section maps to
> its registry row in `core/Core-Audits-and-Debt.md`.

## PD-35 — `discover` (character discovery by best-segment group)

- Verb: character discovery by best-segment neighborhood; returns
  `{ characters: DiscoverCharacter[]; segments: DiscoverSegment[] }`.
- **Open decision (carried over):** flat vs grouped result shape — neo grouped characters by
  best-segment neighborhood; the group shape is more useful for the "similar characters" browse
  surface. Confirm before typing the contract.
- `resolveSegmentDisplay` — the segment-hit display JOIN (`chat_segments` → `characters` →
  `assets`; D28 flat row, no version join) lands in `persistence/display.ts` beside
  `resolveCharacterDisplay` when a verb needs display-enriched segment hits.
- Pool constants that land with it: `DISCOVER_SEGMENT_POOL_*`, `CSLS_POOL_FACTOR`
  (`substrate/constants.ts` deliberately defines only what the built verbs consume).

## PD-36 — `images` (cross-modal text→image) + the CSLS-skip exception

- Verb: cross-modal text→image search over `image_embeddings` with a pool-capped multimodal rerank.
- **The esoteric that must survive (carry into `verbs/images.ts` verbatim):**
  `image_embeddings.hub_score` is computed from image↔image cosine (~0.6–1.0 scale). A cross-modal
  text→image query produces similarities in a completely different range (~0.05–0.17). Adding
  `hub_score` to the cross-modal distance dominates ranking and INVERTS the order (verified against
  a 309-card corpus — generic placeholder avatars outrank relevant matches). The verb must skip
  CSLS adjustment on the text→image path; `hub_score` exists on that table only for a future
  image↔image similarity verb. Pin with an inline invariant comment + an `images.int.test.ts` test
  asserting a hub-score-dominant outlier (blank/generic avatar) does not outrank a relevant match.
  (Same invariant carried in `domains/embeddings.md` (gutted — the code is the doc; git history) + `domains/discovery.md` (gutted — the code is the doc; git history) Esoteric #2.)
- Lens gating: the `image_embeddings.lens` column + `(assetId, model, lens)` unique are BUILT
  (`@orb/db/schema/embeddings.ts`; `IMAGE_LENSES` from `@orb/contracts/embeddings`, D34). Decide
  whether the verb gates on lens availability or treats `image-captioned`-only as the initial state
  with `image-raw` additive (a re-embed workload populates `image-raw` rows).

## PD-37 — `fields` / `suggest` (the lexical BM25 engine)

- MiniSearch in-memory BM25 index over character card fields, LRU+TTL cache per owner, per-scope
  instruction boosts, fuzzy+prefix. Verb in `verbs/fields.ts`; cache + index internals (`CardDoc`,
  `IndexCacheEntry` — file-private, not exported) in `substrate/field-index.ts`. `minisearch` is
  not yet a server-workspace dep.
- Two engines, one domain: vector + lexical are complementary retrieval surfaces on the same
  `SearchService`; callers pick the surface by verb, never a backend. The tRPC `search.fields` /
  `search.suggest` procs land with it (Tier-4: the router calls the search service directly; neo's
  corpus cross-proxy is dead).
- **Open decision (carried over):** cache invalidation — neo let the TTL expire on character-card
  update; a `character.updated` event subscription would be sharper. Decide TTL-only vs event.
- Gate candidate with it: `minisearch` import allowed only in
  `domain/search/substrate/field-index.ts`.

## PD-38 — unified `search(UnifiedSearchParams)` dispatch + `SearchScope`

- The one dispatch verb over the full surface: `UnifiedSearchResult` as a 7-branch discriminated
  union, exhaustive `assertNever` dispatch in `service.ts` (the `workloads.kind` mapped-Record
  pattern is the gold standard). Premature until the verb set above exists.
- `SearchScope` (one chat · a character across all chats · all the user's chats) becomes a single
  importable canonical union in `contract/params.ts` — never re-declared inline. The lens axis
  (`image-raw | image-captioned | segment | digest | card-text`) is OWNED by `embeddings`
  (`@orb/contracts/embeddings` / its contract) — search imports the union, never re-declares it.
- **The esoteric that must survive — the `chat_digest_speakers` OR-branch:** the by-character
  cross-chat scope ("this character across all chats") cannot filter on
  `chat_digests.scoped_character_id IN (...)` alone — that misses co-star blocks where the queried
  character spoke but was not the digest's egocentric producer. The `chat_digest_speakers` JOIN is
  the OR-branch that catches those blocks; removing it silently cuts recall for multi-character
  scenes. The table is built and written by memory's build (`@orb/db/schema/embeddings.ts`);
  search has no reader yet — the belt lands in `persistence/scope.ts` with this scope, tested in a
  group-chat scenario (a co-star block is included when scoping by the co-star's characterId).

## Unflagged design (no PD row yet)

- **`SCOPE_INSTRUCTIONS`** — per-scope query + rerank instruction strings for an instruction-aware
  embedder/reranker (pure data, `substrate/instructions.ts`). Nothing in the built verbs consumes
  it (they pass `inputType: "query"` only); it rides with whichever deferred verb first needs
  per-scope boosts. No registry row exists.
- **Gate candidate (invariant #1 enforcement):** no lint/dep-cruiser gate yet pins
  `vector_distance_cos` SQL to `domain/search/persistence/` — today it holds by convention
  (comment-only mentions elsewhere; discovery computes in-RAM via `@orb/kit/vector-math`).
