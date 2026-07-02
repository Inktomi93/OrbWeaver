# Orbweaver — `search`: the one retrieval engine

> **Status: planning (authoritative detail).** `search` is the single, parameterized retrieval
> capability: vector cosine scan + CSLS hub-adjust + cross-encoder rerank + lexical BM25 — scope ×
> lens × rerank over the entire embedding store. No other domain re-implements cosine or maintains
> a BM25 index. This doc is the target spec.
> Authoritative upstream: `knowledge-cluster.md` (the engine contract + invariant #4 + the
> two-lens substrate); `_FANOUT-BRIEF.md` §4 (search pain ledger); `domains.md` (the domain map).
> `structure.md` §4 is the 8-slot template this domain follows.

---

## What this domain owns

- **The vector retrieval engine** — exact cosine scan (`vector_distance_cos` SQL; ANN dropped at
  this corpus scale) over the embedding store's four source kinds: character card text
  (`character_embeddings`), avatar images (`image_embeddings`), chat segments
  (`chat_segments`), and chat digests (`chat_digests`). Read-only; `embeddings` owns every
  write.
- **Scope × lens dispatch** — one chat · a character across all chats · all the user's chats;
  lens = raw segment (verbatim) · semantic digest · a specific tier · `image-raw` (pure visual)
  · `image-captioned` (joint vision+text). The lens controls text-influence on the result.
- **CSLS hub-adjust ranking** — `max(0, dist − 1 + hub_score)`, penalizing generic hub vectors that
  are close to everything. The clamp at 0 is the neo invariant: CSLS only DEMOTES (an anti-hub row must
  never go negative and out-rank a closer match), and because the clamp flattens every `cos ≥ hub`
  candidate to 0, the comparator breaks ties on the RAW distance (never concat order). `hub_score` is
  computed by `discovery`, stored by `embeddings`, read here. `NULL_HUB_FALLBACK = 0.5` keeps
  freshly-embedded rows on the same scale as scored rows.
- **Cross-encoder rerank orchestration** — calls the `rerank` inference role (via injected
  `RoleClients.rerank`); applies `rerankPoolByScores` budget-cap; skips unscorable candidates
  (no `sourceText`) and places them AFTER ranked ones (preserving recall).
- **Joint cross-chat rerank + block-level dedupe** — digests and segments in one rerank list;
  `dedupeRankedBlocks` collapses duplicate blocks by `(chatId, tier, blockIdx,
scopedCharacterId)` key; `collapseByContentHash` collapses fork/import copies post-ranking,
  pre-k-cap (the better-ranked representative wins, consumer always gets k distinct blocks).
- **The lexical BM25 engine** — MiniSearch in-memory index over character card fields with LRU+TTL
  cache per owner, per-scope instruction boosts, fuzzy+prefix. The vector and lexical engines are
  complementary; both live here (the retrieval domain). In neo-tavern this was misplaced in
  `corpus/verbs/field-search.ts`; in orbweaver it moves into `search`.
- **Per-scope retrieval instructions** — `SCOPE_INSTRUCTIONS`: per-scope query + rerank instruction
  strings for the instruction-aware embedder/reranker. Pure data, domain-local.
- **Pool sizing math** — `OWNER_OVERFETCH`, `CSLS_POOL_FACTOR`, `SCOPED_POOL_K`,
  `RERANK_POOL_FACTOR`, `DISCOVER_SEGMENT_POOL_*`: the over-fetch budgets that make top-k stable
  under rerank. Pure constants + deterministic formulas; no I/O.
- **CSLS math** — `cslsAdjust`, `compareCsls`, `compareCslsBy` (the ranking comparators).
  In neo-tavern these live in `constants.ts`; in orbweaver they move to `substrate/csls.ts` (pure
  functions over floats, no I/O, no domain deps — but search-local; they do NOT move to `@orb/kit`
  because `discovery` does NOT call them directly; discovery hands its `hub_score` values to
  `embeddings.store()` which stores them, and `search` reads+applies them — one owner).
- **Segment display resolver** — `resolveSegmentDisplay`: JOIN `chat_segments` →
  `characters` → `assets`; returns the display shape attached to a segment hit (the card is the flat
  `characters` row — D28; no version join). Persistence concern; moves to `persistence/display.ts`.
- **Character display resolver** — `resolveCharacterDisplay`: JOIN `characters` →
  `character_summaries` → `assets`; enriches character card hits with distilled facets (`genre`,
  `tone`, `elevatorPitch`) read off the flat `characters` row (D28 — no version join). Persistence
  concern; moves to `persistence/display.ts`.

This domain does **not** own: vector writes (that is `embeddings`); digest generation or the
`{{memory}}` assembly policy (that is `memory`); themes/hubness computation/distillation (that is
`discovery`); character card CRUD (that is `character`); image CAS storage (that is `assets` +
`infra/storage`); the tRPC wire layer (that is `transport/trpc/routers/search.ts`).

---

## The two engines, one domain

Two complementary retrieval surfaces:

| Surface     | Implementation                                                              | Consumer                                                                          |
| ----------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Vector**  | exact SQL `vector_distance_cos` scan → CSLS → optional cross-encoder rerank | `memory` (chat-scoped recall), `discovery` (character retrieval), tRPC `search.*` |
| **Lexical** | MiniSearch BM25 over card fields                                            | tRPC `search.fields` / `search.suggest`                                           |

They share the same `SearchService` interface. Callers pick the surface by which verb they call;
they do not pick a backend.

---

## The 8-slot layout

```
domain/search/
├── index.ts                FRONT DOOR — only legal external import
├── service.ts              COMPOSITION ROOT — creates sub-factories, dispatches by scope/kind. ZERO logic.
├── context.ts              DI BUNDLE — SearchContext interface (db, roleClients, cas, models).
│                           Does NOT construct RoleClients — receives them as a required dep from entry/.
├── contract/
│   ├── service.ts          SearchService interface — the exhaustive public surface
│   ├── params.ts           UnifiedSearchParams, SearchScope, FieldSearchParams, DiscoverParams, CorpusParams
│   ├── results.ts          UnifiedSearchResult (discriminated union, 7 branches) + every hit type:
│   │                         SearchHit, ImageSearchHit, DiscoverCharacter, DiscoverSegment,
│   │                         CharacterCardHit, DigestSearchHit, SegmentSearchHit, CorpusHit
│   ├── views.ts            (search results are already typed; views.ts holds the client-facing
│   │                         flattened shapes if the transport layer projects them)
│   └── errors.ts           SearchError (typed domain error — e.g. no embed model configured)
├── verbs/
│   ├── knn.ts              top-k vector scan — embed query → scan one table → CSLS → optional rerank
│   ├── find-characters.ts  character-card vector search with distilled-facet enrichment
│   ├── discover.ts         character discovery by best-segment group
│   ├── digests.ts          within-chat digest scan (recall's caller) — scope = the ONE authorized
│   │                         `scope.chat` + egocentric `scopedCharacterId` + tiered `candidates`; owner
│   │                         derives via the producer card (D20), no `chats.ownerId`
│   ├── segments.ts         within-chat segment scan — same `scope.chat` derivation (D18/D20)
│   ├── corpus.ts           hybrid digest+segment corpus search with joint rerank + block dedupe
│   │                         (was: memory.ts corpus)
│   ├── images.ts           cross-modal text→image search with pool-capped multimodal rerank
│   └── fields.ts           MiniSearch/BM25 lexical field search + suggest
│                             (was: corpus/verbs/field-search.ts)
├── persistence/
│   ├── display.ts          resolveSegmentDisplay, resolveCharacterDisplay — JOIN helpers producing
│   │                         display shapes; was: context.ts mixed with DI wiring
│   ├── scope.ts            scopeCond SQL-fragment builder: within-chat = `chat_id = scope.chat`;
│   │                         cross-chat (corpus) owner belt DERIVED via `characters.ownerId` through the
│   │                         `scopedCharacterId` producer card (D20) — NEVER `chats.ownerId` (D18),
│   │                         NEVER a `chat_participants` read (membership-gating is MATERIALIZED at BUILD
│   │                         by the witnessing horizons, knowledge-cluster §6 "in full, not host-only v1");
│   │                         incl. the chat_digest_speakers OR-branch. The scope predicate is applied
│   │                         BEFORE cosine rank AND before `content_hash` collapse (the no-leak invariant)
│   ├── nearest.ts          nearestCharacters, nearestSegments — raw SQL vector_distance_cos
│   │                         queries; NearestCharacter, NearestSegment row shapes live here
│   └── digest-rows.ts      MemoryDigestRow, MemorySegmentRow shapes + fetch helpers
│                             (SQL result row types; was: inline in verbs/memory.ts)
├── substrate/
│   ├── csls.ts             cslsAdjust, compareCsls, compareCslsBy, NULL_HUB_FALLBACK, rerankPoolByScores
│   │                         (pure ranking math over floats; no I/O; was: constants.ts mixed with
│   │                         numeric tunables + Candidate type)
│   ├── constants.ts        numeric tuning constants: OWNER_OVERFETCH, CSLS_POOL_FACTOR,
│   │                         SCOPED_POOL_K, RERANK_POOL_FACTOR, DISCOVER_SEGMENT_POOL_*
│   ├── dedupe.ts           dedupeRankedBlocks (pure function; was: exported from verbs/memory.ts
│   │                         for test access — moves here so the test mirror path resolves cleanly)
│   ├── instructions.ts     SCOPE_INSTRUCTIONS per-scope query+rerank strings (pure data, no I/O)
│   └── rerank.ts           applyRerank — cross-verb rerank orchestration (budget-cap, unscorable
│   │                         passthrough); was: context.ts mixed with DI wiring
│   └── field-index.ts      IndexCacheEntry, CardDoc, LRU+TTL cache internals for the BM25 engine
│                             (file-private types; kept substrate-local, not exported)
└── (no named subsystem needed — verbs are flat and self-contained)
```

**`context.ts` — explicit interface:** `SearchContext` is a named interface in `contract/service.ts`
(or top of `context.ts`), NOT `ReturnType<>`. Shape must be readable without hovering.

**`roleClients` is a required dep, not internally defaulted:** neo-tavern's `context.ts` falls back
to `createDefaultRoleClients()` (a reach into `_shared/role-clients-binder`). In orbweaver that
drawer does not exist; the composition root (`entry/`) wires the role clients and passes them in.
`createSearchService(db, deps)` where `deps.roleClients` is required, not optional.

---

## Verbs (the `SearchService` interface)

```typescript
SearchService = {
  // Unified dispatch (discriminated by scope/kind)
  search(params: UnifiedSearchParams): Promise<UnifiedSearchResult>

  // Direct verbs (called by memory, discovery, tRPC)
  knn(params: KnnParams): Promise<SearchHit[]>
  findCharacters(params: FindCharactersParams): Promise<CharacterCardHit[]>
  discover(params: DiscoverParams): Promise<{ characters: DiscoverCharacter[]; segments: DiscoverSegment[] }>
  digests(params: DigestsParams): Promise<DigestSearchHit[]>
  segments(params: SegmentsParams): Promise<SegmentSearchHit[]>
  corpus(params: CorpusParams): Promise<CorpusHit[]>
  images(params: ImageSearchParams): Promise<ImageSearchHit[]>

  // Lexical engine
  fields(params: FieldSearchParams): Promise<CharacterCardHit[]>
  suggest(params: SuggestParams): Promise<string[]>
}
```

**Cross-verb injection:** `applyRerank` is shared across `find-characters`, `discover`, `digests`,
`segments`, `corpus`, and `images`. It lives in `substrate/rerank.ts`, imported directly by each
verb (substrate → verb is a downward import; allowed). It is NOT injected as a dep — it is a pure
substrate helper, no I/O of its own (the `RoleClients.rerank` call is passed in as a function arg).

---

## Public surface (`index.ts`)

```typescript
// Errors
export { SearchError } from "./contract/errors";

// Input types
export type {
  UnifiedSearchParams,
  SearchScope,
  FindCharactersParams,
  DiscoverParams,
  CorpusParams,
  ImageSearchParams,
  FieldSearchParams,
  SuggestParams,
} from "./contract/params";

// Result types
export type {
  UnifiedSearchResult,
  SearchHit,
  ImageSearchHit,
  DiscoverCharacter,
  DiscoverSegment,
  CharacterCardHit,
  DigestSearchHit,
  SegmentSearchHit,
  CorpusHit,
} from "./contract/results";

// Service types
export type { SearchService, SearchServiceDeps, SearchContext } from "./contract/service";

// Factory
export { createSearchService } from "./service";
```

`dedupeRankedBlocks` is **not** on the public surface. It lives in `substrate/dedupe.ts`; the test
mirror path (`tests/server/domain/search/substrate/dedupe.test.ts`) reaches it there. The test does
not bypass the front door — it tests the substrate directly, which is allowed (the substrate is a
pure helper, not a domain-internal secret).

---

## Movement table

| Unit                                                                                                                            | Outcome              | Target                                                                                                  | Rationale                                                                                                                                                                                                                                                                                                                                              | Enforcement tier                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search/context.ts` — DI wiring (`db`, `roleClients`, `cas`, `models`)                                                          | stays domain feature | `domain/search/context.ts` — slimmed to DI only                                                         | Only the DI wiring stays; display resolvers + rerank logic split out below.                                                                                                                                                                                                                                                                            | resolve-time (same package)                                                                                                                                                                                                                                      |
| `search/context.ts` — `createDefaultRoleClients()` fallback (reach into `_shared/role-clients-binder`)                          | **deleted**          | `entry/` wires role clients and passes them in as a required dep                                        | `_shared` does not exist in orbweaver; role client construction is the composition root's job.                                                                                                                                                                                                                                                         | resolve-time: `_shared` is gone; `createSearchService(db, deps)` type makes `deps.roleClients` required — missing field fails `tsc`                                                                                                                              |
| `search/context.ts` — `applyRerank`                                                                                             | → `substrate/`       | `domain/search/substrate/rerank.ts`                                                                     | Cross-verb shared operation; pure orchestration (RoleClients.rerank is an arg). Extracting removes the "context does too many things" smell.                                                                                                                                                                                                           | lint-time: `no-inline-types` + `feature-structure` gate (context.ts must be DI bundle only)                                                                                                                                                                      |
| `search/context.ts` — `resolveSegmentDisplay`, `resolveCharacterDisplay`                                                        | → `persistence/`     | `domain/search/persistence/display.ts`                                                                  | DB-JOIN helpers; persistence concerns that happen to live in context today.                                                                                                                                                                                                                                                                            | lint-time: `feature-structure` gate (context.ts = DI bundle; DB reads belong in persistence/)                                                                                                                                                                    |
| `search/constants.ts` — `cslsAdjust`, `compareCsls`, `compareCslsBy`, `NULL_HUB_FALLBACK`, `rerankPoolByScores`                 | → `substrate/`       | `domain/search/substrate/csls.ts`                                                                       | Pure ranking math over floats; no I/O; no domain deps. `constants.ts` mixes three concerns; this is the pure-math slice. NOT moved to `@orb/kit` — search is the only caller; `discovery` does not call these functions (it hands hub scores to `embeddings.store`, not to search's comparators).                                                      | lint-time: `no-inline-types`; `kit-purity` gate would fire if it moved to `kit` with a search import                                                                                                                                                             |
| `search/constants.ts` — `OWNER_OVERFETCH`, `CSLS_POOL_FACTOR`, `SCOPED_POOL_K`, `RERANK_POOL_FACTOR`, `DISCOVER_SEGMENT_POOL_*` | stays domain feature | `domain/search/substrate/constants.ts`                                                                  | Numeric tuning constants; search-local. Move to `substrate/` to give `constants.ts` a proper slot instead of a mixed-bag file.                                                                                                                                                                                                                         | lint-time: `feature-structure`                                                                                                                                                                                                                                   |
| `search/constants.ts` — `Candidate` interface                                                                                   | → `persistence/`     | `domain/search/persistence/nearest.ts`                                                                  | Internal pipeline type used by cross-encoder input. It is a DB-read output shape, not a pure type.                                                                                                                                                                                                                                                     | lint-time: `no-inline-types`                                                                                                                                                                                                                                     |
| `search/constants.ts` — `SegmentDisplay` interface                                                                              | → `persistence/`     | `domain/search/persistence/display.ts`                                                                  | Output shape of `resolveSegmentDisplay` (a DB-JOIN).                                                                                                                                                                                                                                                                                                   | lint-time: `no-inline-types`                                                                                                                                                                                                                                     |
| `search/context.ts` — `CharacterDisplay` interface                                                                              | → `persistence/`     | `domain/search/persistence/display.ts`                                                                  | Output shape of `resolveCharacterDisplay` (a DB-JOIN).                                                                                                                                                                                                                                                                                                 | lint-time: `no-inline-types`                                                                                                                                                                                                                                     |
| `search/instructions.ts`                                                                                                        | stays domain feature | `domain/search/substrate/instructions.ts`                                                               | Pure data (per-scope strings), no I/O, no domain deps — ideal substrate. Path rename only.                                                                                                                                                                                                                                                             | resolve-time (same package)                                                                                                                                                                                                                                      |
| `search/verbs/memory.ts` — `digests()`                                                                                          | → `verbs/`           | `domain/search/verbs/digests.ts`                                                                        | Three unrelated scans in one file. Split to one verb per file per the template rule.                                                                                                                                                                                                                                                                   | lint-time: `verb-naming` gate                                                                                                                                                                                                                                    |
| `search/verbs/memory.ts` — `segments()`                                                                                         | → `verbs/`           | `domain/search/verbs/segments.ts`                                                                       | Same split.                                                                                                                                                                                                                                                                                                                                            | lint-time: `verb-naming` gate                                                                                                                                                                                                                                    |
| `search/verbs/memory.ts` — `corpus()`                                                                                           | → `verbs/`           | `domain/search/verbs/corpus.ts`                                                                         | Same split.                                                                                                                                                                                                                                                                                                                                            | lint-time: `verb-naming` gate                                                                                                                                                                                                                                    |
| `search/verbs/memory.ts` — `dedupeRankedBlocks`                                                                                 | → `substrate/`       | `domain/search/substrate/dedupe.ts`                                                                     | Pure function (no I/O). Was exported from the verb file only for test access; moving to `substrate/` gives it the right home and a clean test mirror path.                                                                                                                                                                                             | lint-time: `no-inline-types` gate; test mirror gate (`test-mirror`) enforces `tests/server/domain/search/substrate/dedupe.test.ts`                                                                                                                               |
| `search/verbs/memory.ts` — `scopeCond` SQL helper                                                                               | → `persistence/`     | `domain/search/persistence/scope.ts`                                                                    | SQL-fragment builder; persistence concern. Shared by digests/segments/corpus after the verb split.                                                                                                                                                                                                                                                     | lint-time: `feature-structure` (SQL in persistence/, not verbs/)                                                                                                                                                                                                 |
| `search/verbs/memory.ts` — `MemoryDigestRow`, `MemorySegmentRow` inline types                                                   | → `persistence/`     | `domain/search/persistence/digest-rows.ts`                                                              | SQL result row shapes; declared outside `contract/` or `persistence/`.                                                                                                                                                                                                                                                                                 | lint-time: `no-inline-types`                                                                                                                                                                                                                                     |
| `search/verbs/core.ts` — `NearestSegment`, `NearestCharacter` inline interfaces                                                 | → `persistence/`     | `domain/search/persistence/nearest.ts`                                                                  | SQL result shapes from the raw vector-scan helpers.                                                                                                                                                                                                                                                                                                    | lint-time: `no-inline-types`                                                                                                                                                                                                                                     |
| `search/verbs/core.ts` — `nearestCharacters`, `nearestSegments` (raw SQL helpers)                                               | → `persistence/`     | `domain/search/persistence/nearest.ts`                                                                  | Pure DB reads; belong in persistence/, not verbs/.                                                                                                                                                                                                                                                                                                     | lint-time: `feature-structure`                                                                                                                                                                                                                                   |
| `search/verbs/core.ts` — `knn()`, `findCharacters()`, `discover()`                                                              | stays domain feature | `domain/search/verbs/knn.ts`, `find-characters.ts`, `discover.ts`                                       | One verb per file per the template. Path rename only; logic stays.                                                                                                                                                                                                                                                                                     | lint-time: `verb-naming` gate                                                                                                                                                                                                                                    |
| `search/verbs/images.ts` — `images()`                                                                                           | stays domain feature | `domain/search/verbs/images.ts`                                                                         | Self-contained; file-private pool constants (appropriate for the cross-modal path). No change.                                                                                                                                                                                                                                                         | resolve-time (same package)                                                                                                                                                                                                                                      |
| `search/verbs/core.ts` — raw SQL strings naming `character_embeddings` table                                                    | → `persistence/`     | `domain/search/persistence/nearest.ts`                                                                  | Table name should appear in exactly one place in the domain.                                                                                                                                                                                                                                                                                           | lint-time: `feature-structure` gate (SQL in persistence/ only)                                                                                                                                                                                                   |
| `corpus/verbs/field-search.ts` — `MiniSearch/BM25 lexical engine`                                                               | **move** → `search`  | `domain/search/verbs/fields.ts` (verb) + `domain/search/substrate/field-index.ts` (cache + index types) | The abstraction is right (lexical complements vector retrieval); the home is wrong. `search` is the retrieval domain; field-search is retrieval. The tRPC router already exposes it under the `search` namespace (`search.fields`, `search.suggest`). Moving closes the boundary straddle.                                                             | resolve-time: `corpus/verbs/field-search.ts` ceases to exist; the `transport/trpc/routers/search.ts` import path updates to `domain/search`; dep-cruiser `domain-no-cross-feature` fires if corpus calls search internals                                        |
| `corpus/verbs/field-search.ts` — `CardDoc`, `IndexCacheEntry` inline types                                                      | → `substrate/`       | `domain/search/substrate/field-index.ts`                                                                | File-private types; stay local to the verb once rehomed. Not exported.                                                                                                                                                                                                                                                                                 | lint-time: `no-inline-types` (the exported `CardDoc` is the boundary — keep it package-internal)                                                                                                                                                                 |
| `providers/_shared/vector-math.ts` — `cosineSim`, `cosineDistance`, `l2Normalize`, `mean`, `pairwiseCosine`, `cosineToMany`     | → `@orb/kit`         | `@orb/kit/vector-math`                                                                                  | 6 pure functions; zero I/O; zero domain deps; 7 importers across corpus+memory. Currently in `providers/_shared` (wrong — providers is infra, this is math). `search` stops re-importing it once the one SQL engine owns vector retrieval and in-RAM cosine only survives in discovery's all-pairs analytics.                                          | resolve-time: `providers/_shared` does not exist in orbweaver; `@orb/kit` is a declared dep of `@orb/server` — any unresolved import fails immediately                                                                                                           |
| `corpus/substrate/pair-cosine.ts` — `normalizeFlat` (duplicates `l2Normalize` from vector-math.ts)                              | **deleted**          | —                                                                                                       | The unique logic (`pairsAboveThreshold` with CSLS scoring) moves to `domain/discovery/substrate/pair-cosine.ts` (only discovery uses it); `normalizeFlat` is replaced by `@orb/kit/vector-math.l2Normalize`.                                                                                                                                           | compile-time: the duplicate is deleted; any new caller uses `@orb/kit`                                                                                                                                                                                           |
| `corpus/substrate/pair-cosine.ts` — `pairsAboveThreshold` (the unique all-pairs CSLS scoring)                                   | → `discovery`        | `domain/discovery/substrate/pair-cosine.ts`                                                             | Used only by near-duplicate detection (a discovery concern). Not a search concern.                                                                                                                                                                                                                                                                     | resolve-time: `domain/discovery` imports `@orb/kit/vector-math`, not `search`                                                                                                                                                                                    |
| `chat/memory/retrieve.ts` — in-RAM `cosineSim` over loaded `chat_digests` rows                                                  | **replaced**         | `memory` delegates to `search.digests(scope=this chat)`                                                 | Two cosine paths over the same `chat_digests` table (confirmed). In orbweaver: memory's chat-scoped recall calls the search engine. The 6 query semantics (modes, tiered bridge, verbatim window, egocentric scope, keyword match, recency bias) are preserved — they become parameters of `SearchParams` or memory's pre-call assembly (NOT deleted). | compile-time: `chat/memory/retrieve.ts` ceases to hold its own cosine; `memory.recall` is a parameterized call to `search.digests`                                                                                                                               |
| `search/service.ts` — inline `UserId` import at service.ts line 62                                                              | → `contract/`        | `domain/search/contract/params.ts` (the proper home for UserId usage in params)                         | Minor: import style; move to top-level import in params.                                                                                                                                                                                                                                                                                               | lint-time: `no-inline-types`                                                                                                                                                                                                                                     |
| `db/schema/search.ts` — `character_embeddings`, `image_embeddings`, `chat_digests`, `chat_segments`, `chat_digest_speakers`     | **rename + move**    | `@orb/db/schema/embeddings.ts`                                                                          | Schema-naming lie: file named for the consumer. In orbweaver the `embeddings` domain's write path owns these vector tables; the schema file moves to reflect the producer, not the reader. `search` and `memory` read from `@orb/db/schema/embeddings` (a downward dep — allowed).                                                                     | compile-time: schema file move forces all importers to update; `tsc` flags broken imports immediately                                                                                                                                                            |
| `image_embeddings` — single lens per (asset, model); no `lens` discriminator column                                             | **schema change**    | `@orb/db/schema/embeddings.ts` — add `lens: text` column (`image-raw`                                   | `image-captioned`); unique index on `(assetId, model, lens)`                                                                                                                                                                                                                                                                                           | `knowledge-cluster.md` §1 targets two image lenses. The current unique index on `(assetId, model)` allows only one row per asset per model. A `lens` column lets both lenses coexist in the same 1024-dim space. A re-embed workload populates `image-raw` rows. | compile-time: unique-index change; existing `image-raw`-equivalent rows get `lens='image-raw'` in migration |
| `chat_digests.characterVersionId` — cv-pin FK in search results + scopeCond                                                     | **dropped (D28)**    | `@orb/db/schema/embeddings.ts` — column does not exist                                                  | Search verbs keyed on `characterVersionId` for scoping today; orbweaver has no version table (D28). Scope keys on `chat_digest_speakers.characterId` (the identity FK, already present — D25 moved scoping there); the query is `character_id = ?` directly. The cv OR-branch in `scopeCond` is deleted, not migrated.                                 | compile-time: `chat_digests.characterVersionId` and `character_versions` are both gone; the cv branch in `scope.ts` is removed                                                                                                                                   |
| `trpc/routers/search.ts` — `ctx.services.corpus.fieldSearch` / `corpus.fieldSuggest` cross-call                                 | **replaced**         | `ctx.services.search.fields` / `search.suggest`                                                         | Once `fields.ts` moves into `search`, the router calls the search service directly. The cross-router proxy is deleted.                                                                                                                                                                                                                                 | resolve-time: `corpus.fieldSearch` ceases to exist on `CorpusService` once field-search moves; the `tsc` type error is immediate                                                                                                                                 |
| `context.ts` integration tests + corpus tests importing `createSearchContext`, `createSearchCore` directly                      | → test fixtures      | `tests/support/fixtures.ts` — a `withSearch` fixture wrapping `createSearchService`                     | Tests should enter through the service factory (the front door) or a test-fixture wrapper, not reach into `context.ts`. The test mirror gate enforces the path.                                                                                                                                                                                        | lint-time: `test-mirror` gate (tests mirroring `context.ts` internals are at the wrong path)                                                                                                                                                                     |

---

## Cross-feature composition (the injection model)

`search` is called by `memory`, `discovery`, and the tRPC transport layer. None of these reach
into `search` internals — all access is through the front door.

**Injected into `memory` at the composition root:**

| Op injected                            | Provided by   | Used for                                                                                       |
| -------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------- |
| `search.digests(scope=this chat, ...)` | search domain | `memory.recall` — `{{memory}}` assembly; delegates the raw vector scan with chat-scoped params |
| `search.corpus(...)`                   | search domain | cross-chat memory retrieval when mode=mixB/mixC                                                |

The 6 chat-scoped query semantics (`mode` off/mixA/mixB/mixC/tiered; tiered bridge; verbatim
window; egocentric scope; keyword match; recency bias) are **preserved** — they become params on the
`search.digests` / `search.corpus` call assembled by `memory.recall`. `search` does not embed these
policies itself; it exposes the knobs and memory drives them.

**Injected into `discovery` at the composition root:**

| Op injected                  | Provided by   | Used for                                                        |
| ---------------------------- | ------------- | --------------------------------------------------------------- |
| `search.findCharacters(...)` | search domain | character retrieval for similarity browsing, archetype grouping |
| `search.discover(...)`       | search domain | character discovery by segment neighborhood                     |

`discovery` does NOT call `search.corpus` or `search.digests` — it reads embeddings through its own
analytics (all-pairs via `@orb/kit/vector-math`), not the per-user retrieval engine.

**`roleClients` (rerank role) is wired at `entry/`:**

`search` receives the `rerank` role client as a dep at composition time. The `connection` domain's
`resolveRole('rerank')` supplies it. `search` never constructs a role client.

**`collapseByContentHash` — where it moves:**

Neo-tavern imports it from `#server/content-hash` (a server-level utility). In orbweaver:
content-hash logic lives in `@orb/server/kit` (server-only pure primitive; no domain deps). Search
imports it from there.

---

## Spine thread intersections

### §7.4 types and schemas — one home, one direction

- `UnifiedSearchParams`, `SearchScope`, `DiscoverParams`, `CorpusParams`, `ImageSearchParams`,
  `FieldSearchParams` → `domain/search/contract/params.ts`.
- `UnifiedSearchResult` (7-branch discriminated union) + every hit type → `domain/search/contract/results.ts`.
- `Candidate`, `SegmentDisplay`, `CharacterDisplay`, `NearestCharacter`, `NearestSegment`,
  `MemoryDigestRow`, `MemorySegmentRow` → `domain/search/persistence/` (DB-read output shapes).
- `SearchContext` → explicit named interface in `domain/search/contract/service.ts` (not `ReturnType<>`).
- The inline `type Cand = CorpusHit & { hub, text, contentHash, scopedCharacterId }` in
  `verbs/corpus.ts` is borderline acceptable as a truly local alias (extends a contract type,
  used only in one verb); if named, it goes to `domain/search/persistence/digest-rows.ts`.

### §7.5 string-union dispatch discipline

`SearchScope` must be a single importable canonical union in `domain/search/contract/params.ts`
(not re-declared inline at call sites). The `over` / `group` top-level discriminant in
`UnifiedSearchResult` must have an exhaustive `assertNever` guard in `service.ts`'s dispatch switch
(the mapped-Record pattern from `workloads.kind` is the gold standard). The lens axis
(`image-raw` | `image-captioned` | `segment` | `digest` | `card-text`) is owned by `embeddings`
(`embeddings/contract/params.ts`, Rule 11) — search **imports** the union; it does NOT re-declare it. (The
image subset `IMAGE_LENSES` lives in `@orb/contracts/embeddings` per D34 — the `image_embeddings.lens` db
column derives it; the broad text-lens union stays domain-side.)

### knowledge-cluster.md invariant #4

> **One retrieval engine (`search`) — memory + discovery call it, never reimplement cosine.**

This is the search domain's core invariant. The movement table above resolves both violations found
in neo-tavern: `chat/memory/retrieve.ts` in-RAM cosine (replaced by delegation to search) and
`corpus/substrate/pair-cosine.ts` (moved to discovery/substrate; it's all-pairs analytics, not
retrieval). After the move, the only surviving cosine in `@orb/kit/vector-math` serves
discovery's all-pairs analytics — a different access pattern (in-RAM over all vectors for
clustering/near-duplicate), not a parallel retrieval engine.

### Cross-modal image search CSLS exception (esoteric — must survive the rewrite)

`image_embeddings.hub_score` is computed from image-to-image cosine similarities (~0.6–1.0 scale).
A text-to-image cross-modal query produces similarities in a completely different range (~0.05–0.17).
Adding `hub_score` to the cross-modal distance dominates ranking and INVERTS the order. The
`images.ts` verb explicitly skips CSLS adjustment for cross-modal queries. This comment must
survive as a named constant or inline invariant annotation in `verbs/images.ts`:

```typescript
// DO NOT apply hub_score here — cross-modal text→image distances are ~0.05–0.17;
// image↔image hub_score is calibrated to ~0.6–1.0. Mixing them inverts the ranking.
// hub_score exists on this table only for a future image↔image similarity verb.
```

_Enforcement: test-time — an `images.int.test.ts` test verifies that a cross-modal query's top
result is not the hub-score-dominant outlier (a blank/generic avatar should not outrank a
relevant match)._

### `scopedCharacterId` block-key in `dedupeRankedBlocks` (esoteric — must survive)

Two scoped-group characters can produce digests for the same `(chatId, tier, blockIdx)` from
different egocentric POVs. Without `scopedCharacterId` in the block key, one character's POV
silently overwrites the other. The shared bucket is keyed by the synthetic group-as-character's REAL
`CharacterId` (`__group__${chatId}`) — NOT a `''`/NULL sentinel (D28/§4: `scopedCharacterId` is always a
real id) — and that real id must be preserved in the key comparison.

_Enforcement: test-time — `substrate/dedupe.test.ts` asserts that two digests sharing `(chatId,
tier, blockIdx)` but differing only in `scopedCharacterId` are NOT deduplicated._

### `chat_digest_speakers` OR-branch in `scope.ts` (esoteric — must survive)

A by-character scope filter using only the digest's primary `character_id IN (...)` misses co-star blocks where
the queried character spoke but was not the digest's primary character. The
`chat_digest_speakers` JOIN is the OR-branch that catches those blocks. Removing it silently cuts
recall for multi-character scenes. This load-bearing join is preserved in `persistence/scope.ts`
and must be tested in a group-chat scenario.

_Enforcement: test-time — `persistence/scope.int.test.ts` asserts a co-star block is included when
scoping by the co-star's characterId._

---

## Invariants (gate candidates)

1. **One vector retrieval engine** — no domain outside `search` issues a `vector_distance_cos`
   SQL query OR applies cosine over loaded rows to find top-k results.
   _Enforcement: lint-time (dep-cruiser rule: no import of `vector_distance_cos` SQL string
   outside `domain/search/persistence/`)._

2. **One lexical engine** — no domain outside `search` constructs or queries a MiniSearch index.
   _Enforcement: lint-time (dep-cruiser: `minisearch` import allowed only in
   `domain/search/substrate/field-index.ts`)._

3. **`search` is read-only** — `search` never writes to any embedding or digest table.
   `embeddings.store` is the only write path.
   _Enforcement: compile-time — `SearchContext` carries no `db.insert`/`db.update`/`db.delete`
   methods on the vector tables; the context type makes this type-checkable._

4. **CSLS is never applied to cross-modal image queries** — the `images.ts` verb skips
   `hub_score` adjustment.
   _Enforcement: test-time (cross-modal ranking test — see §spine above)._

5. **`dedupeRankedBlocks` key includes `scopedCharacterId`** — the real id (incl. the synthetic
   group-as-character) is preserved; no `''` sentinel (D28/§4).
   _Enforcement: test-time (`substrate/dedupe.test.ts` — see §spine above)._

6. **`collapseByContentHash` runs AFTER ranking, BEFORE k-cap** — consumer always gets k
   distinct blocks; the better-ranked representative wins.
   _Enforcement: test-time — a `verbs/corpus.int.test.ts` test seeds two digests with identical
   `contentHash` and asserts the higher-ranked one is returned as the single representative._

7. **`roleClients` is a required dep** — `createSearchService` is typed so `deps.roleClients` is
   non-optional; any call site that omits it fails `tsc`.
   _Enforcement: compile-time._

---

## Open decisions

- **`lens` column migration timing** — the `image-raw` vs `image-captioned` lens split requires a
  schema migration (add `lens` column, unique-index change) AND a re-embed workload run
  (to populate `image-raw` rows). Decide whether to gate the image-search verb on lens availability
  or to treat `image-captioned`-only as the initial state with `image-raw` additive.
- **Memory's `search.digests` param contract — RESOLVED (2026-06-25): a nested `MemoryQueryOptions`
  sub-shape on `search.digests`/`search.corpus`** (in `@orb/contracts/search`, not memory-owned). It
  carries the 6 chat-scoped semantics, with the two that search's owner-wide scan does NOT model today
  made **first-class fields**: (1) `scope: { chat: ChatId }` — chat-scope is a first-class scope
  alongside owner/character (NOT collapsed to owner); (2) `candidates?: BlockKey[]` — the tiered
  bridge-candidate restriction (memory computes coverage, passes the surviving block-keys; search scores
  only those). The remaining four (`mode`, `verbatimWindow`/protected-tail, `keywordMatch`,
  `recencyBias`/`minScore`) are flat fields on the same sub-shape. Rationale: nested keeps the cluster
  cohesive and makes the search-must-model items explicit at the type boundary; it lives in `contracts`
  (not memory) so it's not a memory-specific leak. Memory builds the egocentric _query text_ itself
  (pre-call); search owns the scan.
- **`fields.ts` cache invalidation** — the MiniSearch LRU+TTL cache must invalidate when a character
  card is updated. Today `corpus/field-search.ts` lets the TTL expire; a real `character.updated`
  event subscription would be sharper. Decide whether to keep TTL-only or wire the event.
- **`character_summaries` FK ownership** — `resolveCharacterDisplay` reads `character_summaries`
  (written by `discovery`'s distill workload). In orbweaver this is acceptable (`search` reads
  `discovery`'s output table via `@orb/db` — a downward dep into the schema, not a sideways domain
  import). Consider whether `character_summaries` schema belongs in `@orb/db/schema/discovery` or
  `@orb/db/schema/character`; either is fine as long as it's one place.
- **`discover` verb shape** — neo-tavern's `discover` returns characters grouped by best-segment
  neighborhood. Confirm whether the orbweaver `discover` API should return flat or grouped results;
  the group shape is more useful for the "similar characters" browse surface.

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

## 6. `search` — the one retrieval engine

Read-only over the whole store. **One engine, parameterized:**

- **scope** — one chat · a character · **all the user's chats**
- **lens** — chat: raw **segment** (verbatim) · **semantic** digest · a **tier**; avatar: **image-raw** ·
  **image-captioned**; card: **card-text**. _The lens controls text-influence on the result._
- **rerank / top-k / `minScore` threshold / hub-adjust**

Two access patterns over the same store (ANN dropped at this corpus scale — exact scan):

- **within-chat** (memory's caller): exact cosine over **this chat's BRIDGE** (the §5 multi-tier
  uncovered set — NOT flat tier-0; the diagram's "tier-0 only" was the pre-bridge model), scoped to the
  speaker's bucket(s) per §4. Small, fast, query carries `queryText` + the egocentric `scopedCharacterId`.
- **cross-chat** ("where across all my chats did X happen?"): scan all digests+segments → **CSLS hub
  adjust** (`dist − 1 + hub_score`) → **joint cross-encoder rerank** (digests + segments in ONE list) →
  **dedupe per block** (digest+segment → the better lens) → ranked hits → **seq-span back to canon.**

**Cross-chat is MEMBERSHIP-GATED in full (not "host-only v1").** A user's owner-wide search is membership-
correct: a member can search the rooms they participated in (their **witnessed** content, backed by the
join/leave horizon + `chat_digest_speakers`); a host's search does not silently surface a co-participant's
words from a shared room outside that membership-gated union. The privacy model is the full multi-human
one, built now — not deferred.

`search` also owns the **lexical engine** — a MiniSearch/BM25 index over card fields, the complement to
vector retrieval. Two engines (vector + lexical) under one `search` domain; callers pick.

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

> **See also:** [embeddings.md](embeddings.md) · [memory.md](memory.md) · [search.md](search.md) · [discovery.md](discovery.md)
