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

## PD-35 — `discover` + the similarity trio — BUILT (2026-07-10)

> BUILT: `discover` is a SEARCH verb (D55; neo `search/verbs/core.ts:249` — NOT discovery-domain; the prior
> "discovery-domain / blocked:PD-40" labels were doc defects F1/F2, corrected per
> `reports/stickler/discovery-search-untangle.md`). Shipped WITH its two seed-vector siblings:
>
> - **`discover`** (`verbs/discover.ts`) — text query → the owner's MATERIALIZED chat set (`ownedChatIds`,
>   D20 derive via digests) → owner-wide cosine scan of `chat_segments` → CSLS → optional rerank BEFORE
>   grouping → `resolveSegmentDisplay` credit → group by character. GROUPED result (`DiscoverCharacter[]`,
>   each carrying `DiscoverSegment[]` evidence + `matchCount`; `score` = the best segment's CSLS score). The
>   grouped shape was CONFIRMED (the open decision). Embed is `inputType:"query"` ONLY (neo's
>   `SCOPE_INSTRUCTIONS` deliberately SKIPPED — nothing built consumes per-scope instruction strings; it
>   still rides with the first verb that needs them). Constants: `DISCOVER_SEGMENT_POOL_FACTOR=20`,
>   `DISCOVER_SEGMENT_POOL_CAP=400`, `DISCOVER_SEGMENTS_PER_CHAR=3`, `SNIPPET_CHARS=280` (neo's
>   `CSLS_POOL_FACTOR=4` already exists as `OWNER_OVERFETCH`).
> - **`similarCharacters`** (`verbs/similar-characters.ts`) — seed-vector top-k over the CARD space: reads the
>   seed's STORED card embedding (`readSeedCharacterVector`, owner-belted — NOT a re-embed), scans excluding
>   the seed, CSLS, enriches like `findCharacters` (returns `CharacterCardHit[]`). Realizes the docs'
>   `findCharacters`-shorthand as a seed-vector verb (§4.4 rationale — no query/document space cross).
> - **`similarArt`** (`verbs/similar-art.ts`) — seed-vector top-k over the IMAGE space (avatar↔avatar): reads
>   the seed avatar's STORED vector (`readSeedAvatarVector`, belted on `characters.ownerId` ∩ `assets.ownerId`),
>   scans excluding the seed. **CSLS APPLIES** (same-space image↔image — the CSLS-skip is cross-modal ONLY; this
>   IS the "future image↔image similarity verb" `hub_score` was reserved for). Default lens `image-raw`.
>
> `resolveSegmentDisplay` (`persistence/display.ts`) is the SEGMENT→CHARACTER credit rule: a `chat_segments`
> block (no character column, D28) is credited via its tier-0 `chat_digests` sibling — CO-STAR speakers
> (`chat_digest_speakers`, so a group scene credits every present character) ∪ the `scopedCharacterId` fallback,
> both `synthetic=false` + owner-belted. The V2-2 cross-tenant-seed refusal (foreign seed → empty) + a
> group-chat co-star credit are pinned by tests. tRPC: `search.discover`/`similarCharacters`/`similarArt`
> (the two seed-id verbs are cross-tenant-swept; `discover` is query-only). The as-built code is the doc.

## PD-36 — `images` (cross-modal text→image) + the CSLS-skip exception — BUILT (2026-07-10)

> BUILT: `domain/search/verbs/images.ts` + `persistence/image-nearest.ts` + `ImagesParams`/`ImageSearchHit`
> + the `search.images` tRPC read. Ranks on RAW cosine distance (the CSLS-skip invariant is pinned inline
> and by `images.int.test.ts`'s hub-dominant-outlier test); lens-gated (`lens` is a required param, both
> `image-raw`/`image-captioned` addressable); caption cross-encoder rerank is opt-in (raw-lens hits are a
> recall-preserving passthrough). Owner-scope derives via `assets.ownerId`. The as-built code is the doc.

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

## PD-37 — `fields` / `suggest` (the lexical BM25 engine) — BUILT (2026-07-10)

> BUILT: `domain/search/verbs/fields.ts` (`createFields` + `createSuggest`) + `substrate/field-index.ts`
> (the MiniSearch index + the per-owner LRU+TTL cache, `CardDoc`/`IndexCacheEntry` file-private) +
> `persistence/cards.ts` (the owner card-field corpus read) + `FieldSearchParams`/`SuggestParams` /
> `FieldSearchHit`/`SearchSuggestion` + the `search.fields` / `search.suggest` tRPC reads. `minisearch` is
> a server dep sealed to `field-index.ts` by the `search-minisearch-seal` dep-cruiser rule. **Cache
> invalidation DECIDED: TTL-only** (5-min freshness window; the event-driven `character.updated` upgrade
> path is noted in the file header — the cache shape already supports a targeted evict). `SCOPE_INSTRUCTIONS`
> is NOT consumed here (fields uses fixed per-field boosts, not per-scope instruction strings) — it still
> rides with the first verb that needs per-scope boosts. `SearchContext` gained an injected `now` clock (the
> only time source the domain touches, for the cache TTL). The as-built code is the doc.

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

## PD-38 — unified `search(UnifiedSearchParams)` dispatch + `SearchScope` — STILL DEFERRED

> With `discover` (PD-35) landed the individual verb set now EXISTS — but PD-38 stays DEFERRED: the unified
> dispatch adds ZERO new retrieval capability over the verbs that already exist on the router, and there is
> still no client omnibox consumer. The `SearchScope` half (a) — the by-character cross-chat scope + the
> `chat_digest_speakers` OR-branch — is a real recall-correctness capability, but build it the moment a "this
> character across all chats" surface actually ships (it is consumer-less today). Half (b), the one-dispatch
> verb, waits for the omnibox exactly as this doc's own §"premature" note says.

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
