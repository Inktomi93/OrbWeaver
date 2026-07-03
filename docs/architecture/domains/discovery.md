# Orbweaver — `discovery`: library semantics (themes · hubness · dup · distill)

> **Status: planning (authoritative detail).** `discovery` is the rename of neo-tavern's `corpus`. It
> owns the **semantic library layer** over the embedding store: emergent themes, CSLS hubness, near-
> duplicates, character distillation, archetypes, keyword co-occurrence, image/visual analytics, and the
> composed "library hub" views. It **embeds NOTHING and writes no vector row** — it CONSUMES the
> `embeddings` store (read-only over the vector tables via `@orb/db`) and the `search` engine (injected
> top-k ops), computes its signals in-RAM, and writes ONLY its own rollup tables + the `hub_score`
> column (through the `embeddings.writeHubScores` seam). The rename is deliberate: `corpus` needed
> insider knowledge to place; `discovery` names what it does.
> Authoritative upstream: `knowledge-cluster.md` §7 (discovery), §0/§11 invariants, the hub_score seam
> (§1/§8: discovery computes → embeddings stores → search reads → a vector write never nulls), the
> stats-vs-discovery line (§7 + invariant #7); `domains/embeddings.md` (the `writeHubScores` seam; the
> vector tables are embeddings', not discovery's); `domains/search.md` (discovery calls
> `search.findCharacters`/`search.discover`, never re-implements top-k cosine); the economics-vs-semantics
> boundary (`Core-0` §6 partitioning + the built `domain/stats/` code; the `insights.ts` gray-zone
> resolution → [`proposed/stats-discovery-seam.md`](../proposed/stats-discovery-seam.md)); `_FANOUT-BRIEF.md` §4
> (the corpus→discovery pain entry), §7.4/§7.5, §8.5 (knowledge-cluster recon); `reports/shared-
dissolution.md` (the `vector-math` → `@orb/kit`, `pair-cosine` → discovery, hubness compute-fns moves).
> `structure.md` §4 is the 8-slot template this domain follows.

---

## What this domain owns

- **Emergent themes** — k-means (Lloyd + k-means++, seeded) over tier-0 (`scene`) and tier-1+ (`arc`)
  digest embeddings → `theme_clusters` + `digest_theme_assignments`, each cluster LLM-named via the
  injected `summarize` role. Centroids computed on the content-collapsed set; every digest assigned
  (full coverage). The `theme_clusters.centroid` (a k-means MEAN, not an `embed()` call) is a discovery
  rollup, NOT a primary vector store — so it lives here, not in `embeddings`.
- **CSLS hubness** — `hub_score` per `(entity, model)` for all four vector kinds (character / digest /
  segment / image): the mean cosine to the K nearest SAME-TYPE neighbours (`CSLS_K = 10`). Computed
  here (in-RAM all-pairs / streaming), **written through the injected `embeddings.writeHubScores` seam**,
  read by `search` ranking. discovery never touches `embeddings` persistence directly and never nulls
  `hub_score` — it is the ONLY computer/writer of that column's values.
- **Near-duplicates** — per-type FK rollups `duplicate_character_pairs` / `duplicate_chat_pairs` (D24 — was
  the polymorphic `duplicate_pairs`): character all-pairs cosine (≥ threshold, CSLS-ranked) + chat
  Jaccard-of-segment-contentHashes (fork-lineage-labelled `forked` vs `duplicate`). Real FK + `CASCADE`
  (no delete-time sweep — physics, not a reaper); `ownerId` derived from the entity FK (D23).
- **Character distillation** — the guided-decode `summarize` pass turning each card into FILTERABLE
  facets (genre/tone enum-constrained, sub-genres, setting, tags, elevator pitch, overview) →
  `character_summaries`. Powers browse/catalog/archetype labels and `search`'s `resolveCharacterDisplay`.
- **Archetypes + projection** — k-means over CARD embeddings (the "kinds of characters you collect",
  labelled from distilled facets) and the 2D PCA "corpus galaxy".
- **Keyword co-occurrence** — `keyword_cooccurrence` + `character_keyword_profiles` rollups (keyword×
  keyword within a tier-0 digest's `keywords[]`, hub-token-filtered, content-collapsed).
- **Image / visual analytics** — image near-duplicates (all-pairs over avatar vectors), visual
  archetypes (k-means), portrait↔card cross-modal alignment, and caption-facet distributions/drill
  (`artStyle`/`rating`/`shotType`/… over the stored `caption_meta`).
- **Similarity browsing** — the character similarity GRAPH (all-pairs cosine → nodes+edges) and
  "more like this chat" (segment-centroid kNN, in-RAM). The TOP-K "more like this CHARACTER" / "more
  like this AVATAR" surfaces delegate to the `search` engine (injected), never a local `vector_distance_cos`.
- **Library analytics + composed views** — catalog, compare-characters (facet diff + LLM deep compare),
  ask-card (grammar-constrained Q&A), swipe HOTSPOTS (content half — which moments re-rolled), the
  semantic insights (`themeDrift`, `unusedCharacters`, and the composed `forgottenGems`/`modelRouting`),
  tag auto-suggest (distilled-tags → real `tags` rows), and the composed `home`/`characterDossier`/
  `themeDetail` page views (CONTENT-only — usage is composed client-side from `stats`).

This domain does **not** own: any vector WRITE (that is `embeddings.store`); the four primary vector
tables (`character_embeddings`, `image_embeddings`, `chat_digests`, `chat_segments` — owned by
`embeddings`, read here downward via `@orb/db`); the embed/imageEmbed/caption CONTENT production (image
captioning + card-embed-text building are producer/`embeddings`-indexer concerns); the retrieval engine
— top-k cosine, lexical BM25 / `field-search` (that is `search`, including the lexical engine that lived
in `corpus/verbs/field-search.ts`); turn ECONOMICS — tokens/cost/cache/timing rollups (that is `stats`,
which shares zero tables with discovery); the per-chat recall policy + digest GENERATION (that is
`memory`); character-card CRUD (that is `character`); the tRPC wire layer (that is
`transport/trpc/routers/discovery.ts`).

---

## The defining seam (locked)

> **discovery reads the embedding store read-only, computes its signals, and writes ONLY its own rollup
> tables + `hub_score` (via `embeddings.writeHubScores`). It embeds nothing and writes no vector row.**

This kills the neo-tavern incest the recon confirmed (`_FANOUT-BRIEF.md` §4, §8.5): `corpus` today
(a) **embeds** characters + avatars (`corpus/service.ts` card embed ×2, `embed-images.ts` image embed —
two of the six scattered vector-write sites); (b) **reads memory's digests** out of `chat_digests`; and
(c) **writes `hub_score` back into memory's tables** (`hubness.ts` is the one writer across four tables).
Three concerns tangle in one domain. In orbweaver they split cleanly:

- **Embeds nothing** — the card / image embed passes move to `embeddings` (the indexer `onCharacterUpdated`
  / `onAssetCreated` handlers + the re-index workload, all calling `embeddings.store`). discovery's
  `model`/`embed`/`imageEmbed` surface disappears; it has `summarize` injected (for naming/distill/ask),
  never `embed`.
- **Reads the store read-only** — discovery still SELECTs `chat_digests` / `chat_segments` /
  `character_embeddings` / `image_embeddings` (and their `embedding` / `keywords` / `caption_meta` /
  `content_hash` columns) for clustering and all-pairs analytics. Reading `@orb/db/schema/embeddings` is
  a downward, read-only dep — allowed; the same posture `search` has.
- **Writes hub_score through the seam** — `hubness.ts`'s compute functions move here; the `db.batch`
  `UPDATE … hub_score` write becomes a call to the injected `embeddings.writeHubScores(table, updates[])`.
  discovery never imports `embeddings/persistence/`. One owner of the column's VALUES (discovery), one
  owner of the WRITE mechanism (embeddings), one reader (search) — the §8 seam.

---

## Two cosine access patterns — and why discovery keeps one

`knowledge-cluster.md` invariant #4: _"One retrieval engine (`search`) — memory + discovery call it,
never reimplement cosine."_ The reconciliation (`search.md` §"invariant #4"): discovery's analytics are
a **different access pattern** from retrieval, and stay here:

| Pattern                                                                                                                                      | Who           | Mechanism                                                  | Lives in                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------- | ------------------------------------- |
| **top-k retrieval** ("more like this character/avatar", kNN, find-by-query)                                                                  | `search` ONLY | SQL `vector_distance_cos … ORDER BY dist LIMIT k`          | `domain/search/persistence/`          |
| **in-RAM all-pairs / clustering / paired** (hubness, dup all-pairs, themes/archetypes k-means, similarity graph, PCA, cross-modal alignment) | `discovery`   | `@orb/kit/vector-math` over loaded vectors (no SQL cosine) | `domain/discovery/substrate/` + verbs |

So **discovery issues NO `vector_distance_cos` SQL** — the two neo-tavern uses inside corpus
(`duplicates/retrieve.ts:similarCharacters`, `image-analytics/retrieve.ts:similarArt`, both top-k kNN
scans) delegate to the `search` engine; the cross-modal PAIRED cosines (`portraitAlignment`,
`characterPortrait`) move to in-RAM `@orb/kit/vector-math.cosineSim`. Everything else discovery does is
already in-RAM (k-means, all-pairs `pairsAboveThreshold`, centroid `cosineToMany`) — those stay,
because they are clustering/analytics over the WHOLE loaded set, not a parallel retrieval engine.

---

## The 8-slot layout

```
domain/discovery/
├── index.ts                FRONT DOOR — the only legal external import
├── service.ts              COMPOSITION ROOT — wires verb factories + subsystem seams + injected deps. ZERO logic.
├── context.ts              DI BUNDLE — explicit DiscoveryContext interface (db + summarize role + the
│                           injected embeddings.writeHubScores / search ops / stats economics op +
│                           subsystem-method seams). NOT ReturnType<>. Does NOT default roleClients.
├── contract/
│   ├── service.ts          DiscoveryService interface — read THIS to know everything the domain does;
│   │                         DiscoveryServiceDeps (composition-root injection shape)
│   ├── params.ts           BrowseFilter, TagAssignment, ImageFacetKey, ThemeLevel ('scene'|'arc' union)
│   ├── results.ts          Archetype, BrowseCharacter, CatalogStats, CharacterComparison, DeepComparison,
│   │                         CharacterDistillation, ForgottenGem, ModelRouting, ThemeDriftBucket,
│   │                         UnusedCharacter, CorpusPoint, HubStats, HubTypeStat, SimilarityGraph,
│   │                         SimilarChat, SwipeHotspot, TagSuggestion, ApplyTagsResult, DistillStats,
│   │                         ThemeRow, DuplicateCharacterPair, DuplicateChatPair, ImageDuplicatePair,
│   │                         VisualArchetype, ImageFacets, ImageFacetMember, PortraitAlignmentReport,
│   │                         CharacterPortrait, CooccurrenceStats / ThemeComputeStats / DuplicateComputeStats
│   ├── views.ts            HomeView, CharacterContentProfile, CharacterDossier, ThemeDetail, ImageNeighbor
│   └── errors.ts           DiscoveryError (typed domain error)
├── verbs/
│   ├── distill.ts          computeCharacterSummaries (summarize pass) + browse/facets/characterSummary reads
│   ├── archetypes.ts       k-means over card embeddings → facet-labelled archetypes
│   ├── projection.ts       2D PCA "corpus galaxy"
│   ├── similarity-graph.ts character all-pairs cosine → nodes+edges (was: similarity.ts half)
│   ├── similar-chats.ts    segment-centroid kNN, in-RAM (was: similarity.ts half)
│   ├── catalog.ts          catalog stats + compareCharacters (facet diff)
│   ├── analyze.ts          compareCharactersDeep + askCard (grammar-constrained summarize)
│   ├── swipes.ts           swipeHotspots (content half — re-rolled moments)
│   ├── insights.ts         themeDrift + unusedCharacters (pure semantics) + the composed
│   │                         forgottenGems / modelRouting (stats economics injected — see the line below)
│   ├── tag-suggest.ts      distilled-tags → real `tags` rows (tagSuggestions/apply/applied/remove)
│   ├── compute-hub-scores.ts  the 4 per-kind hub computes; write via injected embeddings.writeHubScores
│   └── views.ts            home / characterDossier / themeDetail composed page views
├── persistence/           ALL db access (reads of the vector store + rollup-table reads; rollup writes
│   │                       live in the subsystem generate.ts files per the {generate,retrieve} split)
│   ├── character-names.ts  characterId → card name (the flat `characters` row, D28; was: substrate/character-names.ts — it READS db)
│   ├── embed-store-reads.ts  the read-only SELECTs over character_embeddings / chat_digests /
│   │                         chat_segments / image_embeddings (vectors + keywords + content_hash) the
│   │                         verbs cluster over — table names appear ONLY here
│   └── messages-semantic.ts  the SEMANTIC projection of a `messages` row (role/content/model/
│                             characterId/createdAt) — the type-enforced stats↔discovery seam (no
│                             economics columns spellable here)
├── substrate/             PURE feature-local helpers (zero I/O)
│   ├── kmeans.ts           Lloyd + k-means++ (uses @orb/kit/vector-math.l2Normalize)
│   ├── pca.ts              power-iteration top-2 PCA
│   ├── pair-cosine.ts      pairsAboveThreshold (all-pairs CSLS-scored pairs; normalizeFlat DELETED →
│   │                         @orb/kit/vector-math.l2Normalize)
│   ├── hub-math.ts         computeGroupHubs + offer + HUBNESS_DENSE_MAX (pure top-K-mean; was hubness.ts)
│   └── json-extract.ts     sliceJsonObject (tolerant LLM-JSON slice; shared by distill/analyze/themes)
├── themes/                NAMED SUBSYSTEM — {generate, retrieve, utils}
│   ├── generate.ts         computeThemes (k-means + LLM naming) + backfillMsgMidAt → theme_clusters/assignments
│   ├── retrieve.ts         themes / themeTimeline / characterThemeProfile / themeCharacters reads
│   └── utils.ts            parseThemeName
├── duplicates/            NAMED SUBSYSTEM — {generate, retrieve}  (no sweep — CASCADE replaces it, D24)
│   ├── generate.ts         computeDuplicatePairs (char all-pairs + chat Jaccard + forkRoots) → duplicate_character_pairs / duplicate_chat_pairs (per-type FK)
│   └── retrieve.ts         readDuplicateCharacters / readDuplicateChats (NO similarCharacters — that → search)
│                           (sweep.ts is GONE — real FK + CASCADE deletes stale pairs; no delete-time reaper, D24)
├── cooccurrence/          NAMED SUBSYSTEM — {generate, retrieve, utils}
│   ├── generate.ts         computeCooccurrence + tallyCooccurrence → keyword_cooccurrence/character_keyword_profiles
│   ├── retrieve.ts         topKeywords / cooccurringKeywords / characterKeywords
│   └── utils.ts            normalizeKeyword
└── image-analytics/       NAMED SUBSYSTEM — {facets, retrieve}
    ├── facets.ts           portraitAlignment (in-RAM cross-modal cosine) + imageFacets / charactersByImageFacet
    │                         / characterPortrait — reads stored caption_meta; NO vector_distance_cos
    └── retrieve.ts         imageDuplicates + visualArchetypes (all-pairs / k-means); NO similarArt (→ search)
```

**`context.ts` — explicit interface:** `DiscoveryContext` is a named interface (not `ReturnType<>`),
matching the template. It carries `db`, the injected `summarize` role op, the injected cross-feature ops
(`embeddings.writeHubScores`, `search.findCharacters`, `search.discover`/image kNN, the `stats` economics
op), and the subsystem-method seam (`ctx.themes.*` / `ctx.duplicates.*` / `ctx.cooccurrence.*` /
`ctx.imageAnalytics.*`). It does NOT call `createDefaultRoleClients()` — that `_shared/role-clients-binder`
drawer does not exist in orbweaver; `entry/` wires the role clients and passes them in as required deps.

**Named subsystems kept (the §4 escape valve):** `themes/`, `duplicates/`, `cooccurrence/`,
`image-analytics/` each own their own rollup tables (a primary key that is not a foreign key to a parent)
— the framework's subsystem bar. `hubness` does NOT clear that bar (it writes the `hub_score` column on
EXISTING tables, no table of its own) → it is verbs (`compute-hub-scores.ts`) + pure `substrate/hub-math.ts`,
not a subsystem. Same call the neo-tavern `hubness.ts` header made.

---

## Verbs (the `DiscoveryService` interface)

```typescript
DiscoveryService = {
  // ── distillation + browse ────────────────────────────────────────────────
  computeCharacterSummaries(): Promise<DistillStats>            // workload-driven (distill-characters)
  browseCharacters(userId, filter?: BrowseFilter): Promise<BrowseCharacter[]>
  characterFacets(userId): Promise<{ genres: FacetCount[]; tones: FacetCount[] }>

  // ── hubness (workload-driven; write via injected embeddings.writeHubScores) ─
  computeCharacterHubScores(opts?): Promise<HubStats>
  computeDigestHubScores(opts?): Promise<number>
  computeSegmentHubScores(opts?): Promise<number>
  computeImageHubScores(opts?): Promise<number>

  // ── themes (workload-driven compute + live reads) ─────────────────────────
  computeThemes(opts?): Promise<ThemeComputeStats>
  themes(userId, level?: ThemeLevel): Promise<ThemeRow[]>

  // ── near-duplicates (workload compute + live reads) ───────────────────────
  computeDuplicatePairs(opts?): Promise<DuplicateComputeStats>
  duplicateCharacters(userId, opts?): Promise<DuplicateCharacterPair[]>
  duplicateChats(userId, opts?): Promise<DuplicateChatPair[]>

  // ── keyword co-occurrence (workload compute + live reads) ─────────────────
  computeCooccurrence(opts?): Promise<CooccurrenceStats>
  topKeywords(userId, opts?): Promise<{ keyword; count }[]>
  cooccurringKeywords(userId, keyword, limit?): Promise<...[]>
  characterKeywords(userId, characterId, limit?): Promise<...[]>

  // ── similarity browsing (graph in-RAM; top-k via injected search) ─────────
  similarityGraph(userId, opts?): Promise<SimilarityGraph>
  similarChats(userId, chatId, limit?): Promise<SimilarChat[]>

  // ── archetypes / projection / catalog / analyze / swipes ──────────────────
  archetypes(userId, k?): Promise<Archetype[]>
  corpusProjection(userId): Promise<CorpusPoint[]>
  catalog(userId): Promise<CatalogStats>
  compareCharacters(userId, a, b): Promise<CharacterComparison | null>
  compareCharactersDeep(userId, a, b): Promise<DeepComparison | null>
  askCard(userId, characterId, question): Promise<{ answer: string } | null>
  swipeHotspots(userId): Promise<SwipeHotspot[]>

  // ── image / visual analytics ──────────────────────────────────────────────
  imageDuplicates(userId, threshold?): Promise<ImageDuplicatePair[]>
  visualArchetypes(userId, k?): Promise<VisualArchetype[]>
  portraitAlignment(userId): Promise<PortraitAlignmentReport>
  imageFacets(userId): Promise<ImageFacets>
  charactersByImageFacet(userId, facet: ImageFacetKey, value): Promise<ImageFacetMember[]>

  // ── semantic insights + composed views ────────────────────────────────────
  themeDrift(userId, level?: ThemeLevel): Promise<ThemeDriftBucket[]>
  unusedCharacters(userId): Promise<UnusedCharacter[]>
  forgottenGems(userId, limit?): Promise<ForgottenGem[]>     // ranking=semantic; tokensOut=injected stats op
  modelRouting(userId): Promise<ModelRouting[]>              // genre=discovery × tallies=injected stats op
  home(userId): Promise<HomeView>
  characterDossier(userId, characterId): Promise<CharacterDossier | null>
  themeDetail(userId, clusterIdx, level: ThemeLevel): Promise<ThemeDetail | null>

  // ── tag auto-suggest (distilled tags → real tags rows) ────────────────────
  tagSuggestions(userId, minCount?): Promise<TagSuggestion[]>
  applyTagSuggestions(userId, assignments: TagAssignment[]): Promise<ApplyTagsResult>
  appliedAutoTags(userId): Promise<{ tag; characterCount }[]>
  removeAutoTag(userId, tag): Promise<boolean>
}
```

**No `model` on the surface.** neo-tavern's `CorpusService.model` (the embed model id) is gone —
discovery does not embed, so it has no embed-model identity to expose. Every read verb takes the already-
branded `userId: UserId` (resolved once at the tRPC seam) and forwards it as `ownerId`; service
implementations never accept caller-supplied ownerId (that was audit #1, a P0 cross-user write — preserve).

**The `compute*` verbs stay standalone-exportable.** `computeThemes` / `computeDuplicatePairs` /
`computeCooccurrence` / `computeCharacterSummaries` / `compute*HubScores` keep a `(db, deps?)` standalone
export (re-exported from the front door) so the workload runners (`transport/jobs` → the `compute-themes`
/ `find-duplicates` / `compute-cooccurrence` / `distill-characters` / `csls` runners) construct their own
`summarize` op + injected `writeHubScores` without threading the whole service.

---

## Public surface (`index.ts`)

```typescript
// Errors
export { DiscoveryError } from "./contract/errors";

// Service + factory + injection shape
export { createDiscoveryService } from "./service";
export type { DiscoveryService, DiscoveryServiceDeps, DiscoveryContext } from "./contract/service";

// Params
export type { BrowseFilter, TagAssignment, ImageFacetKey, ThemeLevel } from "./contract/params";

// Result + view types (consumed via service-method-signature inference at the tRPC routers + tests)
export type {
  Archetype,
  BrowseCharacter,
  CatalogStats,
  CharacterComparison,
  DeepComparison,
  CharacterDistillation,
  ForgottenGem,
  ModelRouting,
  ThemeDriftBucket,
  UnusedCharacter,
  CorpusPoint,
  HubStats,
  SimilarityGraph,
  SimilarChat,
  SwipeHotspot,
  TagSuggestion,
  ApplyTagsResult,
  DistillStats,
  ThemeRow,
  DuplicateCharacterPair,
  DuplicateChatPair,
  ImageDuplicatePair,
  VisualArchetype,
  ImageFacets,
  ImageFacetMember,
  PortraitAlignmentReport,
  CharacterPortrait,
  CharacterContentProfile,
  CharacterDossier,
  HomeView,
  ThemeDetail,
  CooccurrenceStats,
  ThemeComputeStats,
  DuplicateComputeStats,
} from "./contract/results"; // (views in ./contract/views, re-exported here)

// Standalone workload passes (driven by transport/jobs runners, not via tRPC)
export {
  computeThemes,
  computeDuplicatePairs,
  computeCooccurrence,
  computeCharacterSummaries,
  computeCharacterHubScores,
  computeDigestHubScores,
  computeSegmentHubScores,
  computeImageHubScores,
  CSLS_K,
  DEFAULT_DUP_THRESHOLD,
} from "..."; // re-exported from their verb/subsystem homes

// (No delete-time sweep export — duplicate_*_pairs use real FK + CASCADE; stale pairs die with their entity, D24)
```

**Gone from the front door (vs neo-tavern `corpus/index.ts`):** `createCorpusService.model`; the embed
passes (`buildCardEmbedText` / `MIN_SEARCH_TEXT_TOKENS` / `collectEmbedTargets` / `EmbedItem` /
`CardEmbedFields` / `segmentChat` / `Segment` / the `EmbedCorpus*`/`EmbedImages*` types) → `embeddings`
or producer; `clearFieldIndexCache` + the field-search surface → `search`. The
`@public` JSDoc-on-each-export discipline carries over.

---

## Movement table

| Unit                                                                                                                                                                                                                                         | Outcome                                                             | Target                                                                                                                               | Rationale                                                                                                                                                                                                                                                                                                                                                                                             | Enforcement tier                                                                                                                                               |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain/corpus/` (whole feature)                                                                                                                                                                                                             | **rename**                                                          | `domain/discovery/`                                                                                                                  | The name needed insider knowledge (`_FANOUT-BRIEF.md` §4). `discovery` = library semantics; the partitioning map (`structure.md` §6) already calls it `discovery`.                                                                                                                                                                                                                                    | resolve-time: old `domain/corpus` ceases to exist; front-door importers (`transport`, `entry`, `workloads/runner-env`) update to `domain/discovery`            |
| `corpus/service.ts` — `embedAndStore` + `embedAndStoreMany` + `existingKeys`                                                                                                                                                                 | → `embeddings`                                                      | `domain/embeddings/verbs/store.ts` (+ indexer `onCharacterUpdated`)                                                                  | Card embed is a vector WRITE — discovery embeds nothing. The two near-identical embed+upsert bodies collapse into `embeddings.store`.                                                                                                                                                                                                                                                                 | resolve-time: bodies gone from discovery; lint-time: `discovery-no-vector-write` (no `INSERT INTO character_embeddings` outside `embeddings`)                  |
| `corpus/verbs/embed-corpus.ts` (`runEmbedCorpusPass`, `filterEmbedTargets`, slice/skip pipeline)                                                                                                                                             | → `embeddings`                                                      | the `re-index` workload calling `embeddings.store` in bulk                                                                           | The full card embed pass is a write pass; in orbweaver it is the model-change re-index workload over `embeddings.store`.                                                                                                                                                                                                                                                                              | resolve-time: verb file removed from discovery                                                                                                                 |
| `corpus/verbs/embed-images.ts` (`runEmbedImagesPass`, `EmbedImagesPassOptions`)                                                                                                                                                              | → `embeddings`                                                      | `domain/embeddings/indexer/handlers.ts:onAssetCreated` (image-raw + image-captioned)                                                 | Image embed + caption is content production for two lenses; the indexer owns it (per `embeddings.md`).                                                                                                                                                                                                                                                                                                | resolve-time: verb file removed; `EmbedImagesPassOptions` → `embeddings/contract/params.ts` (`no-inline-types`)                                                |
| `corpus/substrate/caption.ts` (`CAPTION_SCHEMA`, `CAPTION_SYSTEM`, `parseCaption`, `flattenCaption`, `CaptionFields`)                                                                                                                        | → `embeddings`                                                      | `domain/embeddings/indexer/` (image-captioned content production)                                                                    | The caption is produced DURING the image-captioned embed (the joint `{image, caption}` vector). discovery only READS the stored `caption_meta` column for faceting.                                                                                                                                                                                                                                   | resolve-time: substrate file moves with the image embed pass; discovery reads `image_embeddings.caption_meta` via `@orb/db`                                    |
| `corpus/substrate/embed-text.ts` (`buildCardEmbedText`, `CardEmbedFields`, `MIN_SEARCH_TEXT_TOKENS`, `truncateAtCodepoint`, `cleanText`, `normalizePlaceholders`, `APPROX_CHARS_PER_TOKEN`) + `substrate/targets.ts` (`collectEmbedTargets`) | → producer                                                          | `embeddings` indexer / `character` (the card→embed-text builder)                                                                     | "What text represents a card" is a producer concern (the embeddings indexer needs it to `store`). discovery's `distill` needs the SAME card text — it reads it via `@orb/db` (the flat `characters` card row, D28) OR the stored `character_embeddings.sourceText`, not by re-building.                                                                                                               | resolve-time: builder leaves discovery; **open decision** on the exact producer home (see Open decisions)                                                      |
| `corpus/verbs/hubness.ts` — `computeCharacterHubScores` / `computeDigestHubScores` / `computeSegmentHubScores` / `computeImageHubScores` (+ `computeAndWriteHubs`, `HubSpec`, the 4 specs)                                                   | stays domain feature                                                | `domain/discovery/verbs/compute-hub-scores.ts`                                                                                       | Hubness is a semantic ranking signal — a discovery concern. The compute stays; only the WRITE changes.                                                                                                                                                                                                                                                                                                | resolve-time: `corpus/verbs/hubness.ts` gone; lint-time: `domain-no-cross-feature` (discovery must not import `embeddings/persistence`)                        |
| `corpus/verbs/hubness.ts` — the `db.batch` `UPDATE … set hubScore` write path                                                                                                                                                                | **re-routed**                                                       | injected `embeddings.writeHubScores(table, updates[])`                                                                               | The §8 seam: discovery computes the values, `embeddings` owns the column write. A vector write never nulls `hub_score`; `writeHubScores` is the only path that sets it.                                                                                                                                                                                                                               | compile-time: `compute-hub-scores.ts` has no `db.update` on a vector table; the write is the injected op's typed signature                                     |
| `corpus/verbs/hubness.ts` — `computeGroupHubs`, `offer`, `HUBNESS_DENSE_MAX`, `CSLS_K`                                                                                                                                                       | → `substrate/`                                                      | `domain/discovery/substrate/hub-math.ts` (`CSLS_K` re-exported from the verb for the runner log)                                     | Pure top-K-mean math over float arrays (dense `pairwiseCosine` + streaming `cosineToMany`); zero I/O.                                                                                                                                                                                                                                                                                                 | lint-time: `feature-structure` (pure math in substrate/)                                                                                                       |
| `providers/_shared/vector-math.ts` (`cosineSim`, `cosineDistance`, `l2Normalize`, `mean`, `pairwiseCosine`, `cosineToMany`)                                                                                                                  | → `@orb/kit`                                                        | `@orb/kit/vector-math`                                                                                                               | 6 pure functions, zero I/O, zero domain; discovery's all-pairs analytics are the surviving consumer (search's only cosine is the SQL engine). Currently misfiled in `providers/_shared` (infra).                                                                                                                                                                                                      | resolve-time: `providers/_shared` does not exist; `@orb/kit` is a declared dep of `@orb/server`; `kit-purity` gate (pure, isomorphic)                          |
| `corpus/substrate/pair-cosine.ts` — `normalizeFlat` (duplicates `l2Normalize`)                                                                                                                                                               | **deleted**                                                         | —                                                                                                                                    | Replaced by `@orb/kit/vector-math.l2Normalize`; one normalize implementation.                                                                                                                                                                                                                                                                                                                         | compile-time: the duplicate is removed; callers use kit                                                                                                        |
| `corpus/substrate/pair-cosine.ts` — `pairsAboveThreshold` + `DuplicatePair` (all-pairs CSLS-scored pairs)                                                                                                                                    | stays domain feature                                                | `domain/discovery/substrate/pair-cosine.ts`                                                                                          | Used only by near-duplicate + similarity-graph (discovery concerns). It is all-pairs analytics, NOT retrieval. `DuplicatePair` is a substrate-local shape.                                                                                                                                                                                                                                            | resolve-time: imports `@orb/kit/vector-math`, never `search`; per `reports/shared-dissolution.md` (corpus/substrate/pair-cosine → discovery/substrate)         |
| `corpus/substrate/kmeans.ts` / `pca.ts` / `json-extract.ts`                                                                                                                                                                                  | stays domain feature                                                | `domain/discovery/substrate/`                                                                                                        | Pure clustering / projection / JSON-slice math; zero I/O. `kmeans` swaps its `providers/_shared` import for `@orb/kit/vector-math.l2Normalize`.                                                                                                                                                                                                                                                       | resolve-time (same package); `sliceJsonObject` → `@orb/kit/json` is an **open decision** (3 discovery consumers)                                               |
| `corpus/substrate/character-names.ts` (`characterNames` — reads db)                                                                                                                                                                          | → `persistence/`                                                    | `domain/discovery/persistence/character-names.ts`                                                                                    | It runs a SELECT/JOIN; substrate must be pure.                                                                                                                                                                                                                                                                                                                                                        | lint-time: `feature-structure` (db reads in persistence/)                                                                                                      |
| `corpus/substrate/segment.ts` (`segmentChat`, the reference segmenter — test-only)                                                                                                                                                           | → `memory`                                                          | `domain/memory/substrate/`                                                                                                           | Live per-block segmentation is `memory`'s; this standalone is the reference impl a corpus-text test exercises. "unwired ≠ worthless" → re-home with the live segmenter.                                                                                                                                                                                                                               | resolve-time; **DECIDED: `memory/substrate`** (ledger §2)                                                                                                      |
| `corpus/verbs/field-search.ts` (MiniSearch/BM25 + `clearFieldIndexCache`, `CardDoc`, `IndexCacheEntry`, `CARD_FIELDS`, `CardField`)                                                                                                          | → `search`                                                          | `domain/search/verbs/fields.ts` + `domain/search/substrate/field-index.ts`                                                           | Lexical search is RETRIEVAL — the `search` domain. The tRPC router already exposes it under the `search` namespace. (Documented authoritatively in `search.md`.)                                                                                                                                                                                                                                      | resolve-time: leaves discovery; the `character.updated` cache-invalidation seam re-homes with it                                                               |
| `corpus/duplicates/retrieve.ts` — `similarCharacters` (`vector_distance_cos … LIMIT k` kNN)                                                                                                                                                  | **replaced**                                                        | injected `search.findCharacters(...)`                                                                                                | Top-k retrieval is `search`'s (invariant #4). discovery's "more like this character" calls the engine.                                                                                                                                                                                                                                                                                                | lint-time: no `vector_distance_cos` SQL outside `domain/search/persistence/` (dep-cruiser); resolve-time: `search.findCharacters` injected at composition root |
| `corpus/image-analytics/retrieve.ts` — `similarArt` (`vector_distance_cos` image kNN)                                                                                                                                                        | **replaced**                                                        | injected `search` image kNN op                                                                                                       | Same — top-k image retrieval is `search`'s.                                                                                                                                                                                                                                                                                                                                                           | lint-time: same `vector_distance_cos` gate                                                                                                                     |
| `corpus/image-analytics/facets.ts` — `portraitAlignment` + `characterPortrait` cross-modal `1 - vector_distance_cos(ce, ie)`                                                                                                                 | **rewritten in-RAM**                                                | `domain/discovery/image-analytics/facets.ts` using `@orb/kit/vector-math.cosineSim` over loaded vectors                              | A paired (card↔avatar) cosine, not top-k — but `vector_distance_cos` SQL is `search`-only. Load both vectors, compute in JS at corpus scale.                                                                                                                                                                                                                                                          | lint-time: `vector_distance_cos` gate; the JOIN keeps the caption-facet reads, drops the SQL cosine                                                            |
| `corpus/verbs/insights.ts` — `forgottenGems` `SUM(tokens_out)`                                                                                                                                                                               | **resolve gray zone**                                               | `tokensOut` from injected `stats` op (`character_stats.tokensOut`); the message-volume COUNT + recency ranking stays in discovery    | The revisit RANKING is semantics; the token figure is economics → it comes from the stats rollup, not a raw `messages` SUM (invariant #7; `Core-0` §6).                                                                                                                                                                                                                                                | compile-time: the economics columns are unspellable in discovery's `messages-semantic` projection; lint backstop `discovery-no-stats-rollups`                  |
| `corpus/verbs/insights.ts` — `modelRouting` (per-model message tally × genre)                                                                                                                                                                | **resolve gray zone**                                               | composition: discovery supplies `genre` (`character_summaries`); stats supplies per-`(model)` tallies; wired at the composition root | A genuine cross-domain JOIN (semantic facet × economics provenance) → a composition, not a discovery-owned raw aggregate.                                                                                                                                                                                                                                                                             | resolve-time: injected `stats` op; `domain-no-cross-feature` backstop                                                                                          |
| `corpus/verbs/insights.ts` — `themeDrift`, `unusedCharacters`                                                                                                                                                                                | stays domain feature                                                | `domain/discovery/verbs/insights.ts`                                                                                                 | Purely semantic (theme assignments / library catalog); no economics.                                                                                                                                                                                                                                                                                                                                  | resolve-time (same package)                                                                                                                                    |
| `corpus/verbs/views.ts` — `characterContentProfile` (`DISTINCT m.model` per character)                                                                                                                                                       | stays domain feature                                                | `domain/discovery/verbs/views.ts` (reads via `messages-semantic` projection)                                                         | "Which models I've run this character on" is per-character semantic context stats never tracks (per-model is GLOBAL in stats). `model` IS on the semantic projection (the disjoint `messages` projections — [`proposed/stats-discovery-seam.md`](../proposed/stats-discovery-seam.md) tier 2).                                                                                                                                                                                                                 | compile-time: read through the semantic projection; no economics column named                                                                                  |
| `corpus/verbs/similarity.ts` (`characterSimilarityGraph` + `similarChats`)                                                                                                                                                                   | **split** → `verbs/`                                                | `verbs/similarity-graph.ts` + `verbs/similar-chats.ts`                                                                               | One verb per file (§4). Both stay in-RAM (graph = `pairsAboveThreshold`; chats = segment-centroid `cosineToMany`) — neither is a `vector_distance_cos` scan.                                                                                                                                                                                                                                          | lint-time: `verb-naming` gate                                                                                                                                  |
| `corpus/contract/results.ts` — `EmbedCorpus*` / `EmbedImagesPassStats` / `EmbedItem` / `CardEmbedFields` types                                                                                                                               | → `embeddings`                                                      | `domain/embeddings/contract/`                                                                                                        | They describe the embed passes (now embeddings').                                                                                                                                                                                                                                                                                                                                                     | resolve-time (move with the pass); `no-inline-types`                                                                                                           |
| `corpus/contract/results.ts:CardField` + `verbs/field-search.ts:CARD_FIELDS`                                                                                                                                                                 | → `search`                                                          | `domain/search/`                                                                                                                     | Moves with the lexical engine.                                                                                                                                                                                                                                                                                                                                                                        | resolve-time                                                                                                                                                   |
| `corpus/image-analytics/facets.ts:ImageFacetKey` (inline)                                                                                                                                                                                    | → `contract/`                                                       | `domain/discovery/contract/params.ts`                                                                                                | An exported string-union param shape declared outside `contract/`.                                                                                                                                                                                                                                                                                                                                    | lint-time: `no-inline-types`                                                                                                                                   |
| `corpus/substrate/pair-cosine.ts:DuplicatePair`, `verbs/field-search.ts:CardDoc/IndexCacheEntry`, `cooccurrence/generate.ts:DigestKeywords/CooccurrenceTally`, `duplicates/generate.ts:GroupRow/JaccardChatPair`                             | keep local (substrate/subsystem-private)                            | their (rehomed) files                                                                                                                | File-private pipeline shapes, not the public surface — they stay where used, not in `contract/`.                                                                                                                                                                                                                                                                                                      | lint-time: `no-inline-types` flags only the EXPORTED leaks                                                                                                     |
| `corpus/context.ts` — `createDefaultRoleClients()` fallback                                                                                                                                                                                  | **deleted**                                                         | `entry/` wires role clients; `DiscoveryContext.summarize` is a required dep                                                          | `_shared/role-clients-binder` does not exist; the composition root is the wiring site. discovery needs only `summarize` (never `embed`).                                                                                                                                                                                                                                                              | resolve-time: `_shared` gone; missing dep fails `tsc`                                                                                                          |
| `corpus/context.ts` — `CorpusContext = ReturnType<typeof createCorpusContext>`                                                                                                                                                               | stays domain feature                                                | `domain/discovery/context.ts` top — explicit `export interface DiscoveryContext`                                                     | The inferred shape is invisible at a glance.                                                                                                                                                                                                                                                                                                                                                          | lint-time: `types-in-contract` / `no-inline-types`                                                                                                             |
| `db/schema/corpus.ts` — `duplicate_pairs` (polymorphic), `keyword_cooccurrence`, `character_keyword_profiles`, `character_summaries`, `theme_clusters`, `digest_theme_assignments`                                                           | **rename + move**; `duplicate_pairs` → **per-type FK tables (D24)** | `@orb/db/schema/discovery.ts` — `duplicate_character_pairs` + `duplicate_chat_pairs` (real FK ×2 + CASCADE) + the 5 others           | The rollups follow the `corpus`→`discovery` rename; `duplicate_pairs` is also de-polymorphized (D24). `ownerId` is dropped from the entity-keyed ones (`character_summaries`/`_keyword_profiles`/`digest_theme_assignments`/`duplicate_*_pairs` — derive via the parent, D23); KEEP on the parentless aggregates (`keyword_cooccurrence`/`theme_clusters`). The `centroid` `vector32` stays a rollup. | compile-time: file move + the per-type FK tables; `tsc` flags broken imports                                                                                   |
| `trpc/routers/corpus.ts`                                                                                                                                                                                                                     | **rename**                                                          | `transport/trpc/routers/discovery.ts`                                                                                                | Router follows the domain rename; delegates to `ctx.services.discovery.*` with `ownerId = principal.userId`. The `corpus.fieldSearch`/`fieldSuggest` procedures move to the `search.*` router.                                                                                                                                                                                                        | resolve-time: `corpus.*` ceases to exist; `tsc` on the router context                                                                                          |

---

## Cross-feature composition (the injection model)

`discovery` is called by the tRPC transport layer (reads) and the `transport/jobs` workload runners (the
compute passes). It CALLS into `embeddings`, `search`, and `stats` — never by reaching into their
internals, always through the composition-root injected ops. It READS the vector tables directly via
`@orb/db` (a downward, read-only dep — expected for a bulk analytics reader, same posture as `search`).

**Injected into `discovery.context` at the composition root:**

| Op injected                                                         | Provided by                                      | Used for                                                                                                                                                               |
| ------------------------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `embeddings.writeHubScores(table, updates[])`                       | embeddings domain                                | `compute-hub-scores.ts` writes the CSLS scores back to vector rows after each compute batch — the ONLY non-`store` vector-table write, and the only `hub_score` writer |
| `search.findCharacters(...)`                                        | search domain                                    | "more like this character" browse + per-character `similar` in the dossier (was the local `similarCharacters` `vector_distance_cos` kNN)                               |
| `search.discover(...)` / search image kNN                           | search domain                                    | character discovery by segment neighbourhood; "more like this avatar" (was the local `similarArt` kNN)                                                                 |
| `summarize` role op                                                 | connection/`entry` (the `summarize` role client) | distill, theme naming, `askCard`/`compareCharactersDeep`. discovery has `summarize` injected but **never `embed`**                                                     |
| `stats` economics op (`stats.byModel` / a focused economics result) | stats domain                                     | `forgottenGems.tokensOut` (from `character_stats`), `modelRouting` per-`(model)` tallies — discovery never SUMs raw `messages` economics                               |

**Wired AT the composition root (discovery is the provider):**

| Op exposed                                                       | Wired into        | Used for                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~`sweepStaleCharacterDuplicates` / `sweepStaleChatDuplicates`~~ | **DELETED (D24)** | The manual delete-time sweep + the `onContentDeleted` composition-root seam are GONE: `duplicate_character_pairs`/`duplicate_chat_pairs` are real FK tables with `CASCADE`, so a deleted character/chat removes its pairs by physics — no reaper, no cross-domain delete seam |

**`search` and `discovery` both read the vector tables via `@orb/db` directly** — expected (bulk
readers, no business-logic concern). discovery calls a `search` VERB only for top-k retrieval; it never
calls `embeddings` verbs for reads.

---

## Spine thread intersections

### `knowledge-cluster.md` §7 (the primary doc) + the hub_score seam (§1/§8)

discovery is the §7 "library semantics" reader: themes/hubness/dup/distill + computes `hub_score`.
Every cluster-doc decision binds here:

- **§0 invariants** — discovery is a pure function of canon + the substrate; it is a derived index,
  never a second source of truth (every rollup row rebuilds from `messages`/vectors). Its compute passes
  run as workloads, never on the send hot path.
- **The seam (§1/§8)** — _discovery computes → embeddings stores → search reads → a vector write never
  nulls._ Enforced structurally: `compute-hub-scores.ts` writes via the injected `embeddings.writeHubScores`
  (no `db.update` on a vector table); `embeddings.store` has no `hubScore` field (per `embeddings.md`
  invariant #2); `search` reads the column with `NULL_HUB_FALLBACK`.
- **§7 stats line** — discovery is SEMANTICS; `stats` is ECONOMICS; they share zero tables. (Detail below.)

### The stats↔discovery line (the type-enforced seam — invariant #7)

`knowledge-cluster.md` invariant #7: _"discovery (semantics) and stats (economics) share no tables;
discovery computes no usage rollup."_ In neo-tavern this held only by prose; the residual gray zone was
`corpus/insights.ts` reading raw `messages` for economics-flavoured aggregates (`forgottenGems` SUMs
`tokens_out`; `modelRouting` tallies per-model volume). Orbweaver makes it RED three ways (mirrors
the stats-side seam — [`proposed/stats-discovery-seam.md`](../proposed/stats-discovery-seam.md)):

1. **discovery touches no rollup/economics table** — `DiscoveryContext` carries the vector tables + its
   own rollup tables + a SEMANTIC `messages` projection (`role`/`content`/`model`/`characterId`/
   `createdAt`) — never the economics columns. _Lint backstop: `discovery-no-stats-rollups` (discovery
   imports none of the four stats rollup tables)._
2. **The economics columns are compile-unreachable** — a discovery query that SUMs `tokens_out` fails to
   type-check: the column isn't on the `messages-semantic` projection it can see. _Compile-time: two
   disjoint `messages` projections (economics in stats, semantic in discovery)._
3. **The insights gray zone resolves by composition** — `forgottenGems` keeps its semantic ranking
   (message-volume COUNT + recency) but sources `tokensOut` from the injected `stats` op; `modelRouting`
   is a composition (discovery `genre` × stats per-model tallies); `themeDrift`/`unusedCharacters` stay
   wholly semantic. _Compile-time: the economics field arrives only through the injected op's typed result._

### §7.4 types & schemas — one home, one direction

- All result/view shapes → `domain/discovery/contract/results.ts` + `views.ts`; param shapes
  (`BrowseFilter`, `TagAssignment`, `ImageFacetKey`, `ThemeLevel`) → `contract/params.ts`.
- The rollup row types → `@orb/db/schema/discovery.ts` (`$inferSelect`/`Insert`).
- The vector-table row types are `@orb/db/schema/embeddings.ts` (read downward; no discovery re-export
  of raw vector rows).
- `DiscoveryContext` → explicit `export interface` (not `ReturnType<>`).
- File-private pipeline shapes (`DuplicatePair`, `DigestKeywords`, `GroupRow`, `JaccardChatPair`,
  `HubSpec`) stay local to their (rehomed) files — not contract types.

### §7.5 string-union dispatch discipline

- **`ThemeLevel`** (`'scene' | 'arc'`) — today an inline `level: "scene" | "arc"` re-spelled across
  `themes`, `themeDrift`, `themeDetail`, `digest_theme_assignments`, `theme_clusters`. ONE importable
  union in `contract/params.ts`; every signature imports it (no inline re-spelling).
- **`ImageFacetKey`** — already a single union (`facets.ts`); move to `contract/params.ts` and keep the
  `SCALAR_FACET_PATHS` mapped-`Record<Exclude<ImageFacetKey, ListFacetKey>, string>` + `isListFacet`
  guard (the gold-standard exhaustive-dispatch pattern — a new facet without a path fails `tsc`). The
  json path is never caller-derived (allowlisted) — preserve.
- **`relation`** (`'duplicate' | 'forked'`) is a single union on each `duplicate_*_pairs` table. **A third
  dedup'd kind is a NEW `duplicate_<kind>_pairs` per-type FK table** (D24 — explicit, like the tag junctions),
  NOT a polymorphic `entity_type` enum + an untyped id. (Reverses neo's "extension = a new enum arm on one
  polymorphic table.") Each table's FK + `CASCADE` is the integrity; no `entity_type` discriminator.
- The distill **`GENRES`/`TONES`** const tuples (guided-decode grammar enums) stay discovery-local data
  (they drive the JSON schema), pinned by `satisfies`.

---

## Esoteric / load-bearing (must survive the rewrite)

1. **`HUBNESS_DENSE_MAX` streaming threshold (~5000)** — the all-pairs `N×N` similarity matrix is
   `4·N²` bytes (~100MB at N=5000); above the threshold `hub-math.ts` must NOT materialize the square —
   it streams row-by-row via `cosineToMany` (one `1×N` row, O(N) memory), folding each into the top-K.
   Results are bit-for-bit identical to the dense `pairwiseCosine` path below the threshold. Drop the
   streaming branch and a large corpus OOMs the `csls` workload. (A discovery concern — `embeddings.
writeHubScores` is a bulk UPDATE that handles any batch size; the dense/streaming choice is here.)

2. **Image `hub_score` is image↔image ONLY** — CSLS is computed + stored for `image_embeddings` for a
   FUTURE image↔image similarity verb, but **must never be applied to text→image** retrieval: image↔image
   cosine sits at ~0.6–1.0, text→image at ~0.05–0.17, so `cslsAdjust(dist, hub) = dist − 1 + hub` is
   dominated by the hub term and INVERTS the ranking (verified against a 309-card corpus — generic
   placeholder avatars outrank relevant matches). discovery stamps the column; `search/verbs/images.ts`
   deliberately omits it on the text→image path (the carry-over invariant in `search.md` + `embeddings.md`).

3. **contentHash collapse BEFORE every all-pairs pass** — hubness, near-duplicates, themes, and
   co-occurrence collapse fork/import copies by `content_hash` before the pairwise/clustering math:
   N byte-identical vectors would otherwise mutually inflate each other's top-K mean to hub ≈ 1 (and bias
   a centroid), then get unfairly demoted. **Cross-axis pin (themes):** centroids are computed on the
   content-COLLAPSED `reps` set, but the "is this cluster worth naming?" gate uses the FULL-space member
   count (a fork-of-50 collapsing to one rep should still be named). Duplicate members inherit their
   representative's `hub_score` (same vector ⇒ same hubness). Break the collapse and forks poison every
   signal.

4. **`hub_score` is advisory-stale by design** — it is NOT auto-invalidated on a re-embed (a single-row
   re-embed would force a full same-(type,model) recompute to be correct). discovery recomputes on the
   scheduled `csls` cadence; `search` treats the column as advisory (a stale score still demotes a
   near-everything vector roughly right). A vector write must NEVER null it (the neo-tavern reset-in-3-
   places bug — eliminated in `embeddings`). If precise hubness ever becomes load-bearing, wire a
   `hubness_dirty` flag + debounce-rebuild (noted, not built).

5. **Per-`(type, model)` hub grouping, cross-tenant by design** — a card and a chat segment have very
   different vector distributions, so hubness is per entity_type/model (digests further by `(tier, model)`).
   It stays CROSS-TENANT (group + solo rows mix; `is_group` is deliberately NOT in the digest groupKey) —
   hubness describes a vector SPACE, not a user. There is no user-triggered caller; only the admin `csls`
   workload invokes it.

6. **k-means returns NORMALIZED centroids** — `kmeans` L2-normalizes inputs (squared-Euclidean ranks as
   cosine) AND re-normalizes the returned centroids, so a downstream `cosineDistance` against them ranks
   the SAME way the clusterer's argmin did near the tail. Skip the return-normalize and theme/archetype
   assignments quietly disagree with the clustering.

7. **`msgMidAt` = position-median, not time-midpoint** — the theme story-time axis buckets on the
   createdAt of the MEDIAN-BY-POSITION message in a digest's `seqStart..seqEnd` span (where the writing
   happened), NOT the arithmetic midpoint of the time interval. Backfilled idempotently for all tiers.

8. **Chat duplicates = Jaccard of segment contentHashes, NOT centroid cosine** — a per-chat centroid is
   dominated by the character's persistent voice, so same-character chats falsely score ≥0.92; Jaccard
   over shared block content-hashes (via an inverted hash→chats index) is precise. `forkRoots`
   (path-compressed lineage walk) labels a pair `forked` (shared fork root) vs `duplicate` (independent
   look-alike) so a fork family reads as "3 forks of this chat", not 3 dups.

9. **Near-dup pairs are PER-TYPE FK tables, not polymorphic (ledger D24)** — `duplicate_character_pairs`
   (FK `characters` ×2, CASCADE) + `duplicate_chat_pairs` (FK `chats` ×2, CASCADE), canonical A<B per the
   unique index. This REVERSES neo's polymorphic `duplicate_pairs` (`entity_type` + plain-text `entity_id_a/b`,
   no FK) and its hand-rolled orphan-GC: **`CASCADE` deletes a pair when either entity is deleted**, so the
   `sweepStale*Duplicates` delete-time verbs + the `onContentDeleted` composition-root seam are **GONE**
   (physics replaces the reaper). `ownerId` is **derived** from the entity FK (D23 — `characters.ownerId` /
   chat→host), not stamped. `replacePairs` stays an atomic per-entity-set delete+insert on recompute, but it
   no longer needs to clear orphaned owners (CASCADE already did). A 3rd dedup'd kind = a new
   `duplicate_<kind>_pairs` table (explicit, like the tag junctions), never a `(type, untyped_id)` soft ref.

10. **Shared/default-avatar exclusion (`SHARED_AVATAR_MIN_REFS = 3`)** — CAS dedups by content hash, so a
    byte-identical placeholder avatar is one asset referenced by N of an owner's characters (D28 — flat
    cards, no versions); an avatar that is
    the current avatar of ≥3 of an owner's characters is excluded from cross-modal alignment + facet
    distributions (it represents no one character and pollutes the signal).

11. **Cross-modal alignment is a PAIRED cosine, moved in-RAM** — `portraitAlignment`/`characterPortrait`
    score cosine(card-text vector, avatar vector) in the unified Qwen3-VL space (text↔image comparable at
    the same model id). It is not top-k retrieval, but it must NOT use `vector_distance_cos` SQL
    (search-only) → load both vectors, compute with `@orb/kit/vector-math.cosineSim`. The caption-facet
    SQL reads (`json_extract(caption_meta, …)`) stay.

12. **Distill is current-card + idempotent** — `computeCharacterSummaries` reads each character's current
    card row (a card edit + re-run refreshes — D28, no version table), upserts by `characterId`. The
    summary's owner is NOT stamped — `character_summaries` has no `ownerId` column (D23); owner-scope
    derives via the character (`characterId → characters.ownerId`).
    SYNTHETIC group characters are skipped (no real card text — would pollute character similarity/themes).

13. **`themes` excludes group rows from solo clustering** (`is_group = 0`) — a room's digests belong to
    the synthetic group character, not the host's personal theme space; mixing them skews an owner's solo
    centroids. The `is_group` tag is the partition handle.

---

## Invariants (gate candidates)

1. **discovery embeds nothing + writes no vector row** — no `domain/discovery` file calls an `embed`/
   `imageEmbed` role op or executes `INSERT INTO` / `UPDATE … embedding` against any vector table.
   _Enforcement: lint-time (`discovery-no-vector-write`: discovery may not import the embeddings schema in
   a write context, nor an embed role op); compile-time (`DiscoveryContext` carries `summarize`, never `embed`)._

2. **`hub_score` is written ONLY through `embeddings.writeHubScores`** — discovery computes the values;
   no `db.update` on a `hub_score` column exists in `domain/discovery`.
   _Enforcement: compile-time (the write is the injected op's typed signature); lint backstop
   (`domain-no-cross-feature`: discovery may not import `embeddings/persistence/`)._

3. **discovery issues NO `vector_distance_cos`** — top-k retrieval delegates to `search`; all discovery
   cosine is in-RAM via `@orb/kit/vector-math`.
   _Enforcement: lint-time (dep-cruiser: `vector_distance_cos` SQL string only in `domain/search/persistence/`)._

4. **discovery computes no usage rollup** — the economics columns of `messages` are reachable only
   through stats' projection; discovery's `messages-semantic` projection omits them.
   _Enforcement: compile-time (disjoint projections); lint backstop `discovery-no-stats-rollups`._

5. **contentHash collapse precedes every all-pairs/cluster pass** — hubness/dup/themes/cooccurrence
   collapse fork copies before the pairwise math; the full-space count gates naming.
   _Enforcement: test-time — a fixture seeding N byte-identical digests asserts they collapse to one
   representative (no hub ≈ 1 inflation; one named theme, not N)._

6. **Image `hub_score` is never read on text→image** — discovery stamps it (reserved for image↔image);
   `search` omits it cross-modally.
   _Enforcement: test-time (the cross-modal ranking test in `search`); discovery-side: the column is
   advisory and unread by discovery's own faceting._

7. **`summarize` (and every cross-feature op) is a required injected dep** — `createDiscoveryService`
   is typed so `deps.summarize` / `deps.writeHubScores` / `deps.searchOps` / `deps.statsEconomics` are
   non-optional; an omitted dep fails `tsc`. No `createDefaultRoleClients` fallback.
   _Enforcement: compile-time + resolve-time (`_shared` does not exist)._

8. **`ownerId` is always `principal.userId`, never input** — every read verb forwards the resolved row
   id; no caller-supplied ownerId reaches a query (audit #1).
   _Enforcement: compile-time (the verb signature takes `UserId`; the tRPC seam supplies it)._

---

## Open decisions

- **Card-embed-text builder home** — `buildCardEmbedText` / `collectEmbedTargets` are "what text
  represents a card", needed by BOTH the `embeddings` indexer (to `store`) and discovery's `distill` (to
  summarize). Options: (a) it lives with the producer (`character`) and both consume; (b) it lives in
  `embeddings` and discovery reads the stored `character_embeddings.sourceText` instead of re-building.
  Lean: (a) for the builder (a card→text transform belongs near the card), and distill reads the
  flat `characters` card row via `@orb/db` (D28 — the card IS the row; no version table to read).
  Either way the builder leaves discovery.
- **Image caption generation home** — the VL caption (`caption.ts` schema + the `summarize` call) is
  content production for the `image-captioned` lens (an `embeddings` indexer concern per `embeddings.md`'s
  open decision), but the structured `caption_meta` is read by discovery's faceting. Confirm caption
  generation lands in `embeddings/indexer` (discovery reads the column), vs a discovery-owned caption pass
  that `embeddings` consumes. Lean: caption generation in `embeddings` (it must precede the joint embed).
- **`sliceJsonObject` → `@orb/kit/json` vs discovery substrate** — pure + 3 discovery consumers (distill,
  analyze, themes/utils). It is a generic JSON-slice primitive; promote to `@orb/kit/json` only if a
  consumer outside discovery appears, else keep substrate-local.
- **`segment.ts` reference segmenter** — the live per-block segmenter is `memory`'s; this standalone is a
  test reference. **DECIDED (ledger §2): re-home to `memory/substrate`** (the natural owner).
- **`similarChats` engine** — currently in-RAM segment-centroid `cosineToMany` (no per-chat centroid
  store). Keep in-RAM (bounded fetch + kit math), or route through `search.discover` if a chat-centroid
  retrieval surface lands. Lean: keep in-RAM (no `vector_distance_cos`; the centroid isn't in the store).
- **`character_summaries` schema home** — `@orb/db/schema/discovery.ts` (written by distill) vs
  `@orb/db/schema/character.ts` (read by `search`'s `resolveCharacterDisplay` for `genre`/`tone`/
  `elevatorPitch`). Either is fine as long as it is ONE place; `search.md` flags the same question. Lean:
  `discovery.ts` (the writer owns it); `search` reads it downward.
- ~~**`duplicate_pairs` sweep timing under de-pin**~~ — **RESOLVED by D24: there is no sweep.** The
  per-type FK `duplicate_character_pairs`/`duplicate_chat_pairs` use real FK + `CASCADE`, so a deleted
  character/chat removes its pairs automatically — no delete-time `sweepStale*` verb, no `onContentDeleted`
  seam, no de-pin sequencing concern.
- **Image hub↔image browse verb** — the reserved `image_embeddings.hub_score` use case (image↔image
  similarity browse) is a future `search` verb that opts INTO reading the column; discovery already
  computes/stamps it. Decide when the browse surface lands (a `search` + discovery decision).

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

## 7. `discovery` — library semantics (+ computes `hub_score`)

Read-only over the store; **embeds nothing itself**. Owns:

- **themes** — k-means clusters over digest embeddings → `theme_clusters` + assignments (partitioned by
  the `isGroup`/`roomKind` tag so group rows don't blend in).
- **hubness** — CSLS `hub_score` per (entity, model). Written to the embeddings rows via the embeddings
  write helper; read by `search` ranking. (The seam: discovery computes, embeddings stores, search reads,
  vector-write never nulls.)
- **near-duplicates**, **distillation** (genre/tone/pitch → `character_summaries`), **archetypes**,
  **similarity browsing**.

`discovery` is **semantics**; `stats` is **economics** (tokens/cost/cache/timing — zero vector tables).
The line is **type-enforced**: discovery never computes a usage rollup.

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
