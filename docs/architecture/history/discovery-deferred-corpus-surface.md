---
kind: spec
status: draft
updated: 2026-07-03
---

# Proposed — `discovery`: the deferred corpus surface (PD-40 · PD-39)

> Gap doc from gutting `domains/discovery.md` (partially-built domain; code is truth). The BUILT
> slice — duplicate-CHARACTER detection, themes (compute + read), the four CSLS hub passes, the
> `writeHubScores` seam, substrate (collapse/hub-math/kmeans/pair-cosine), all 7 rollup tables in
> `@orb/db/schema/discovery.ts` — is documented by `packages/server/src/domain/discovery/` headers +
> tests. The in-code deferral ledger is `domain/discovery/contract/service.ts` (FLAG\[PD-40] /
> FLAG\[PD-39] / FLAG\[PD-22]). This doc carries ONLY the genuinely-unbuilt design so it survives the
> doc's deletion. NOT here (owned elsewhere): the insights economics composition + the disjoint
> `messages` projections → [`stats-discovery-seam.md`](stats-discovery-seam.md) (PD-22/PD-40 tier
> 2–3); the lexical `fields`/`suggest` engine + cross-modal image search + the image↔image hub
> browse verb → [`search-deferred-verbs.md`](search-deferred-verbs.md) (PD-36/PD-37).

## PD-40 — the deferred verb waves (the rest of neo-tavern's `corpus`)

Each wave lands with its verbs + result types + the injected ops it needs. The target file slots
(the 8-slot layout the built slice already follows):

| Wave | Verbs | Home | Injected ops it adds |
| - | - | - | - |
| ~~distill + browse~~ **BUILT** | `computeCharacterSummaries` (= the built `distillCharacters`), `browseCharacters(userId, filter)`, `characterFacets` — the CONTENT-only distilled catalog read (facets + card identity; engagement is stats, composed client-side). `BrowseFilter`/`BrowseSort`(`recent`/`name`) params + `BrowseCharacter`/`CharacterFacets`/`FacetCount` results | `verbs/distill.ts` | none new (`summarize` already on the bundle) |
| ~~archetypes + projection~~ **BUILT** | `archetypes(userId, k?)` (per-space k-means over CARD embeddings, content-collapsed, labelled from distilled facets — `Archetype`/`ArchetypeMember`), `corpusProjection` (2D PCA over the owner's PRIMARY space — `CorpusPoint`) | `verbs/archetypes.ts` + `verbs/projection.ts` + `substrate/pca.ts` (power-iteration top-2) + `persistence/summary-reads.ts` | none |
| ~~similarity browsing~~ **BUILT** | `similarityGraph` (all-pairs cosine → nodes+edges, reuses `substrate/pair-cosine.ts`; per-`model` grouping), `similarChats` (segment-centroid kNN, in-RAM `cosineToMany`; ledger-pinned in-RAM, TITLE-only hits per D28) — both DISCOVERY-NATIVE, ZERO search | `verbs/similarity-graph.ts` + `verbs/similar-chats.ts` + the new `readOwnedSegmentVectorsByChat` present-host read | **none** — the stickler untangle (F3, `reports/stickler/discovery-search-untangle.md`) corrected the prior FALSE "`search.findCharacters`" annotation; it belonged to the dossier `similar` arm ONLY, never these two (the two-cosine-access-patterns rule: all-pairs in-RAM is discovery's, top-k is search's) |
| ~~catalog / analyze / swipes~~ **BUILT (completed 2026-07-13)** | `catalog` + `compareCharacters` (`verbs/catalog.ts`); `compareCharactersDeep` + `askCard` (`verbs/analyze.ts` — the catalog facet diff arrives INJECTED per domain-no-cross-verb, decorated with a guided-decode `summarize` narrative/grounded answer over `readCharacterMessageSamples`, a SEMANTIC selected-variant read); `swipeHotspots` (`verbs/swipes.ts` — `message_variants` count per assistant slot HAVING >1, owner-belted via `characters.ownerId` so a foreign chatId reads zero rows) | `verbs/catalog.ts` / `verbs/analyze.ts` / `verbs/swipes.ts` | the semantic `messages`/`message_variants` reads (`persistence/message-reads.ts`) — zero economics columns (seam tier 2) |
| ~~insights~~ **BUILT** | **BUILT (semantics)**: `themeDrift` (story-time month buckets over `msgMidAt`, `level` default scene — `ThemeDriftBucket`) + `unusedCharacters` (no `chat_participants` character seat — `UnusedCharacter`) in `verbs/insights.ts`. **BUILT (economics-composed, PD-22/PD-40)**: `forgottenGems` (semantic volume+recency ranking + injected per-character economics — `ForgottenGem`) + `modelRouting` (distilled genre × per-`(character, model)` economics — `ModelRoutingRow`) in `verbs/economics-insights.ts`, composing the injected `stats` ops (`characterEconomics`/`characterModelEconomics`, wired at the root) | `verbs/insights.ts` + `verbs/economics-insights.ts` | `stats.characterEconomics` / `stats.characterModelEconomics` (WIRED — `stats-discovery-seam.md` tier 2/3) |
| ~~tag auto-suggest~~ **SUPERSEDED (owned by the `tag` domain — NOT built in discovery)** | Neo's corpus-side `tagSuggestions`/`applyTagSuggestions`/`appliedAutoTags`/`removeAutoTag` are a DUPLICATE of the tag domain's review queue. In orb: discovery's distill pass STAGES `source:'auto', status:'pending'` suggestions (BUILT, via `attachCardTagByName`); the `tag` domain OWNS the review — `TagService.listPendingSuggestions` (the queue), Accept = `attachCardTagByName(status:'accepted')`, Reject = `detachCardTagByName` (tag contract header: "the PD-40 distill + import card-tag carry" review queue). Building it in discovery = two homes for one concept (constitution §1, one-home). No discovery verb. | — (tag domain) | — |
| ~~cooccurrence~~ **BUILT** | `computeCooccurrence` + `topKeywords`/`cooccurringKeywords`/`characterKeywords` (keyword×keyword within a tier-0 digest's `keywords[]`, hub-token-filtered >`hubFraction`, content-collapsed; caps `maxPairs=10k`). Owner via present-host derive; profiles credit `scopedCharacterId`; orb drops neo's per-pair sampled `characterIds` column (bare weight). Runner-env `computeCooccurrence` WIRED (bulk-only). | `cooccurrence/{generate,retrieve,utils}.ts` subsystem | none |
| ~~image analytics~~ **BUILT** | **BUILT**: `imageDuplicates` + `visualArchetypes` (in-RAM image↔image cosine/kmeans per space — `retrieve.ts`), `portraitAlignment` (PAIRED in-RAM cosine `@orb/kit/vector-math`, NOT SQL `vector_distance_cos`), `imageFacets` + `charactersByImageFacet` (caption\_meta facets; the `ImageFacetKey` §7.5 dispatch — `IMAGE_FACET_KEYS` tuple in `contract/params` + `SCALAR_FACET_PATHS` Record + `isListFacet` guard in `facets.ts`). `SHARED_AVATAR_MIN_REFS=3` exclusion in `persistence`. `similarArt`/"more like this avatar" is BUILT as the SEARCH verb `search.similarArt` (2026-07-10; top-k image↔image = search's per D55 + the pinned image-analytics header — NOT a discovery scan; CSLS APPLIES same-space). | `image-analytics/{facets,retrieve}.ts` subsystem + `persistence/embed-store-reads.ts` | none — `search.similarArt` is queried client-side alongside these views |
| ~~composed views~~ **BUILT (completed 2026-07-13)** | `home` + `themeDetail` + `characterDossier` (`verbs/views.ts`; sibling-subsystem reads INJECTED via `ViewsDeps` at the root — a verb may not import a subsystem). The dossier composes card facets + an in-RAM portrait cosine (`readOwnedPortraitPairs` filtered to the card) + the injected cross-domain `similar` op — `search.similarCharacters` narrowed to the discovery-local `DossierNeighbor` at the entry root (search's hit shape never enters the discovery contract) | `verbs/views.ts` + `persistence/embed-store-reads.ts` | `similar` (`ViewsDeps` ← search, root-wired) |
| ~~chat near-dup arm~~ **BUILT** | `computeChatDuplicatePairs` (Jaccard of segment `content_hash` sets via an inverted `hash→chats` index; `forkRoots` path-compressed lineage over `chats.parentChatId` → `relation` `forked`/`duplicate`; `DEFAULT_CHAT_JACCARD=0.5`; sentinel `model`) + `duplicateChats` read (titles + relation filter). Present-host owner derive; runner-env `findDuplicates` now runs BOTH arms | `duplicates/generate.ts` + `duplicates/retrieve.ts` + `substrate/fork-roots.ts` + `persistence/embed-store-reads.ts` (`readOwnedChatSegmentHashes`/`readOwnedChatLineage`) | none |

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

## PD-39 — `msgMidAt` backfill — BUILT (both arms; tier-k completed 2026-07-13)

`digest_theme_assignments.msgMidAt` = the createdAt of the position-MEDIAN message in the digest's
seq-span, NOT the time-interval midpoint (the column comment in `schema/discovery.ts` carries the
why; nullable until the backfill). Powers `themeDrift`.

**Tier-0 (scene)** (`themes/backfill.ts` → `backfillMsgMidAt`, wired as `service.backfillDigestStoryTime`
AND called at the end of `computeThemes` so a recompute always stamps): a tier-0 digest maps 1:1 to a
verbatim `chat_segments` row at the same `(chatId, blockIdx)` — an EXACT seq-span; the median is the
middle message (by seq position) within it. Idempotent (immutable stamp), owner-scoped.

**Tier-k (arc), completed 2026-07-13 via the memory tier-grid seam**: `chat/memory/recall/bridge.ts`
exports `tier0RangeOf(fanOut, tier, blockIdx)` + the config-resolving `resolveTier0Range` — the ONE home
of the `[j·fanOutᵏ, (j+1)·fanOutᵏ−1]` indexing (`computeBridge` derives from the same `tierSpan`).
Discovery receives it as the injected pure op `DiscoveryContext.tier0RangeOf` /
`ComputeThemesDeps.tier0RangeOf`, bound at `entry/compose/services.ts` over the LIVE
`AppSettings.memoryDefaults` (the same source the digest build resolves per call). The backfill folds a
tier-k digest's covered blockIdx range over the chat's verbatim block grid (`readTierKDigestSpans` +
`readSegmentBlockSpans`, present-host owner derive) → the whole-arc `[min(seqStart), max(seqEnd)]` → the
position-median message. `themeDrift('arc')` now populates. The compute still imports no vector-table
symbol and never spells `fanOut` (Knowledge-Cluster inv 1-2; one-directional flow — the math stays
memory's).

## Open decisions carried (not owned by a PD row)

- **`similarChats` engine** — keep in-RAM segment-centroid `cosineToMany` (no per-chat centroid in
  the store), or route through a future `search` chat-centroid surface. Lean: in-RAM.
- **`discovery-no-vector-write` lint gate** — declared as a ts-morph/ENFORCEMENT-backlog gate (see
  `.dependency-cruiser.cjs` header); today the seam holds by shape (no `db.update` on vector tables
  in the domain — AST-verified) + the typed `writeHubScores` injection.
