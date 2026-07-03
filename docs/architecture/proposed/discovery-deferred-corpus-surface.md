# Proposed — `discovery`: the deferred corpus surface (PD-40 · PD-39)

> Gap doc from gutting `domains/discovery.md` (partially-built domain; code is truth). The BUILT
> slice — duplicate-CHARACTER detection, themes (compute + read), the four CSLS hub passes, the
> `writeHubScores` seam, substrate (collapse/hub-math/kmeans/pair-cosine), all 7 rollup tables in
> `@orb/db/schema/discovery.ts` — is documented by `packages/server/src/domain/discovery/` headers +
> tests. The in-code deferral ledger is `domain/discovery/contract/service.ts` (FLAG[PD-40] /
> FLAG[PD-39] / FLAG[PD-22]). This doc carries ONLY the genuinely-unbuilt design so it survives the
> doc's deletion. NOT here (owned elsewhere): the insights economics composition + the disjoint
> `messages` projections → [`stats-discovery-seam.md`](stats-discovery-seam.md) (PD-22/PD-40 tier
> 2–3); the lexical `fields`/`suggest` engine + cross-modal image search + the image↔image hub
> browse verb → [`search-deferred-verbs.md`](search-deferred-verbs.md) (PD-36/PD-37).

## PD-40 — the deferred verb waves (the rest of neo-tavern's `corpus`)

Each wave lands with its verbs + result types + the injected ops it needs. The target file slots
(the 8-slot layout the built slice already follows):

| Wave | Verbs | Home | Injected ops it adds |
| --- | --- | --- | --- |
| distill + browse | `computeCharacterSummaries` (guided-decode `summarize` → `character_summaries`, table BUILT), `browseCharacters(userId, filter)`, `characterFacets` | `verbs/distill.ts` | none new (`summarize` already on the bundle) |
| archetypes + projection | `archetypes(userId, k?)` (k-means over CARD embeddings, labelled from distilled facets), `corpusProjection` (2D PCA "corpus galaxy") | `verbs/archetypes.ts` + `verbs/projection.ts` + `substrate/pca.ts` (power-iteration top-2) | none |
| similarity browsing | `similarityGraph` (all-pairs cosine → nodes+edges, reuses `substrate/pair-cosine.ts`), `similarChats` (segment-centroid kNN, in-RAM `cosineToMany`) | `verbs/similarity-graph.ts` + `verbs/similar-chats.ts` | `search.findCharacters` (top-k "more like this" is search's, NOT a local `vector_distance_cos`) |
| catalog / analyze / swipes | `catalog`, `compareCharacters` (facet diff), `compareCharactersDeep` + `askCard` (grammar-constrained `summarize`), `swipeHotspots` (content half — which moments re-rolled) | `verbs/catalog.ts` / `verbs/analyze.ts` / `verbs/swipes.ts` | the semantic `messages` read (see seam doc) |
| insights | `themeDrift` + `unusedCharacters` (pure semantics) + `forgottenGems`/`modelRouting` (stats-composed) | `verbs/insights.ts` | the `stats` economics op — design in `stats-discovery-seam.md` tier 3 |
| tag auto-suggest | `tagSuggestions` / `applyTagSuggestions` / `appliedAutoTags` / `removeAutoTag` (distilled facet tags → real `tags` rows) | `verbs/tag-suggest.ts` | the tag-domain write op (composition-root wired) |
| cooccurrence | `computeCooccurrence` + `topKeywords`/`cooccurringKeywords`/`characterKeywords` (keyword×keyword within a tier-0 digest's `keywords[]`, hub-token-filtered, content-collapsed; tables BUILT) | `cooccurrence/{generate,retrieve,utils}.ts` subsystem | none |
| image analytics | `imageDuplicates`, `visualArchetypes`, `portraitAlignment`, `imageFacets`, `charactersByImageFacet` | `image-analytics/{facets,retrieve}.ts` subsystem | `search` image kNN for "more like this avatar" |
| composed views | `home` / `characterDossier` / `themeDetail` (CONTENT-only — usage is composed client-side from `stats`) | `verbs/views.ts` | `search.findCharacters` (dossier `similar`) |
| chat near-dup arm | the `duplicate_chat_pairs` half of `computeDuplicatePairs` + `duplicateChats` read | `duplicates/generate.ts` (extend) | the chat fork-lineage read |

Runner seams already inert-wired: `entry/compose/runner-env.ts` stubs `discovery.distillCharacters`
/ `computeCooccurrence` as `notBuilt(PD-40)`; the `distill-characters` + `compute-cooccurrence`
runners exist and fail loud. Reads join `transport/trpc/routers/discovery.ts` per wave.

## The chat near-dup arm (design that must survive)

- **Jaccard of segment `content_hash`es, NOT centroid cosine** — a per-chat centroid is dominated
  by the character's persistent voice, so same-character chats falsely score ≥ 0.92. Jaccard over
  shared block content-hashes via an inverted `hash → chats` index is precise.
- **`forkRoots`** — a path-compressed lineage walk over `chats.parentChatId` (D27) labels a pair
  `forked` (shared fork root) vs `duplicate` (independent look-alike), so a fork family reads as
  "3 forks of this chat", not 3 dups. The `relation` axis + `RELATIONS` tuple
  (`@orb/contracts/discovery`) + the `duplicate_chat_pairs` table (per-type FK + CASCADE, D24) are
  ALREADY BUILT — only the compute is missing.

## Image analytics (design that must survive)

- **Shared/default-avatar exclusion (`SHARED_AVATAR_MIN_REFS = 3`)** — CAS dedups by content hash,
  so a byte-identical placeholder avatar is ONE asset referenced by N of an owner's characters. An
  avatar that is the current avatar of ≥ 3 of an owner's characters is excluded from cross-modal
  alignment + facet distributions (it represents no one character and pollutes the signal).
- **Cross-modal alignment is a PAIRED cosine, in-RAM** — `portraitAlignment`/`characterPortrait`
  score cosine(card-text vector, avatar vector) in the unified space. Not top-k retrieval, but
  `vector_distance_cos` SQL is search-only → load both vectors, compute with
  `@orb/kit/vector-math.cosineSim`. The caption-facet SQL reads (`json_extract(caption_meta, …)`)
  stay SQL; discovery only READS the stored `caption_meta` column (caption production is the
  embeddings indexer's).
- **`ImageFacetKey` dispatch (§7.5 gold standard, carry over from neo)** — ONE union in
  `contract/params.ts` + a mapped `SCALAR_FACET_PATHS: Record<Exclude<ImageFacetKey, ListFacetKey>,
  string>` + an `isListFacet` guard, so a new facet without a json path fails `tsc`; the json path
  is allowlisted, never caller-derived.

## Distill (design that must survive)

- Current-card + idempotent: reads each character's current card row (D28 — a card edit + re-run
  refreshes), upserts by `characterId` (the table's natural PK). SYNTHETIC group characters are
  skipped (no real card text) — the exclusion helper is already built in
  `persistence/embed-store-reads.ts`.
- The `GENRES`/`TONES` const tuples (guided-decode grammar enums) stay discovery-local data pinned
  by `satisfies`; the db columns are plain TEXT (grammar-constrained, not db-constrained —
  `schema/discovery.ts` header).
- **Card-text source (open decision, carried):** distill needs the same card text the embeddings
  indexer embeds. Lean: read the flat `characters` card row via `@orb/db` (D28), NOT re-building
  embed text and NOT reading `character_embeddings.sourceText`. The `buildCardEmbedText` builder
  home (producer vs embeddings) is an embeddings-side decision.
- `sliceJsonObject` (tolerant LLM-JSON slice; consumers: distill, analyze, themes-naming) —
  substrate-local (`substrate/json-extract.ts`); promote to `@orb/kit/json` only if a consumer
  outside discovery appears.

## PD-39 — `msgMidAt` backfill (lands with the themeDrift wave)

`digest_theme_assignments.msgMidAt` = the createdAt of the position-MEDIAN message in the digest's
seq-span, NOT the time-interval midpoint (the column comment in `schema/discovery.ts` carries the
why; nullable until the backfill). Backfill idempotently for all tiers; it powers `themeDrift` only.

## Open decisions carried (not owned by a PD row)

- **`similarChats` engine** — keep in-RAM segment-centroid `cosineToMany` (no per-chat centroid in
  the store), or route through a future `search` chat-centroid surface. Lean: in-RAM.
- **`discovery-no-vector-write` lint gate** — declared as a ts-morph/ENFORCEMENT-backlog gate (see
  `.dependency-cruiser.cjs` header); today the seam holds by shape (no `db.update` on vector tables
  in the domain — AST-verified) + the typed `writeHubScores` injection.
