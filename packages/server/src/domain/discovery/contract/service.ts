// domain/discovery/contract/service — the typed API surface (read THIS to know everything the slice does).
// Holds:
//   • DiscoveryContext      the explicit DI bundle the verbs close over (NOT `ReturnType<>` — §7.4)
//   • DiscoveryServiceDeps  what the entry root supplies (identical to the context — no transform)
//   • DiscoveryService      the authoritative verb interface (the front door re-exports the type)
//   • the standalone-compute DEPS shapes (the workload runners construct these directly — see below)
//   • the injected cross-feature op types (type-only — wired at the composition root)
//
// ── THE INJECTION MODEL (boundaries-are-physics) ───────────────────────────────────────────────────────
// THE DEFINING SEAM: discovery embeds NOTHING and writes no vector row. It reads the vector
// store read-only (via @orb/db), computes its signals in-RAM (@orb/kit/vector-math + substrate), and writes
// ONLY its own rollup tables + the `hub_score` column — the latter through the INJECTED `writeHubScores`
// seam (the embeddings domain owns the write mechanism; discovery owns the values; search reads — §1/§8).
// Cross-feature capability arrives as injected ops, type-only on the bundle, wired at the entry root:
//   - `writeHubScores` — `EmbeddingsService["writeHubScores"]` (type-only `#domain/embeddings` import — the
//     sanctioned cross-feature SHAPE import, depcruise `domain-no-cross-feature`: "TYPE-ONLY imports across
//     features ARE allowed"). The ONLY non-`store` vector-table write + the ONLY `hub_score` writer.
//   - `summarize` — the bound `RoleClients["summarize"]` callable (the entry root binds credential+model via
//     `connection.resolveRole(summarize)` and threads the THUNK in; discovery never sees a credential and
//     NEVER gets `embed` — it embeds nothing). Used for theme NAMING only.
//   - `now` / `new*Id` — the injected clock + id minters (determinism — no ambient `Date.now()`/`typeid()`).
//
// RECONCILIATION (the task prompt's older framing): the prompt said "inject search (knn/findCharacters) +
// connection.resolveRole + RoleClients". The DOC wins (CLAUDE.md). This slice — duplicate-CHARACTER
// detection + theme/hub discovery — uses NONE of `search`: character near-dup is in-RAM all-pairs
// (the two-cosine-access-patterns rule: discovery keeps the in-RAM all-pairs pattern, search owns top-k).
// `search.findCharacters` is consumed by the DEFERRED similarity-graph/dossier surface, not this slice — so
// it is NOT on the bundle (no unused dep). `connection.resolveRole` + the RoleClients BIND happen at the
// entry root; discovery receives the already-bound `summarize` thunk, not the resolver.
//
// ── DEFERRAL LEDGER (this slice = duplicate-character + theme/hub + distill/browse) ─────────────────────
// BUILT (PD-40 waves cleared): distill READ-half — `browseCharacters` + `characterFacets` (the CONTENT-only
//   distilled catalog; `verbs/distill.ts`). The distill WRITE-half (`distillCharacters`) was already built.
//   archetypes + projection — `archetypes` (per-space k-means over card embeddings, `verbs/archetypes.ts`) +
//   `corpusProjection` (2D PCA, `verbs/projection.ts` + `substrate/pca.ts`); facet labels via
//   `persistence/summary-reads.ts`.
//   cooccurrence — `computeCooccurrence` + `topKeywords`/`cooccurringKeywords`/`characterKeywords`
//   (`cooccurrence/{generate,retrieve,utils}.ts`); the `compute-cooccurrence` runner-env op WIRED.
//   insights (pure-semantics half) — `themeDrift` + `unusedCharacters` (`verbs/insights.ts`).
//   insights (economics-composed half, PD-22/PD-40 CLEARED) — `forgottenGems` + `modelRouting`
//   (`verbs/economics-insights.ts`); the stats↔discovery seam Tier 3. Composes the injected `stats` economics
//   ops (`characterEconomics`/`characterModelEconomics`, wired at the root); discovery keeps the SEMANTIC
//   ranking/genre-grouping and reads no raw `messages` economics (the seam's Tier 2 owns that, D26-aware).
//   catalog (CONTENT-only) — `catalog` + `compareCharacters` (`verbs/catalog.ts`).
//   chat near-dup arm — `computeChatDuplicatePairs` (Jaccard of segment content-hashes + `forkRoots` lineage →
//   `relation`) + `duplicateChats` (`duplicates/generate.ts`+`retrieve.ts`, `substrate/fork-roots.ts`); the
//   `find-duplicates` runner-env op now runs BOTH the character + chat arms.
//   composed views (CONTENT-only) — `home` + `themeDetail` (`verbs/views.ts`; sibling reads injected via
//   `ViewsDeps` at the root). `characterDossier` stays DEFERRED (needs search `similar` + image `portrait`).
//   image-analytics (minus similarArt) — `imageDuplicates`/`visualArchetypes` (`image-analytics/retrieve.ts`) +
//   `portraitAlignment`/`imageFacets`/`charactersByImageFacet` (`image-analytics/facets.ts`; the ImageFacetKey
//   §7.5 dispatch). Paired in-RAM cosine; `SHARED_AVATAR_MIN_REFS=3` exclusion in persistence.
//   similarity (DISCOVERY-NATIVE, ZERO search) — `similarityGraph` (all-pairs over `substrate/pair-cosine`;
//   its header reserves this consumer) + `similarChats` (segment-centroid `cosineToMany`, in-RAM per the
//   ledger — centroid NOT stored — `Core-Laws-and-Precedents.md:78`). Both compose discovery's OWN vector
//   substrate + `summary-reads` genre; NEITHER calls `search` (the two-cosine-access-patterns rule — analytics
//   is not retrieval). `verbs/similarity-graph.ts` + `verbs/similar-chats.ts` + the new
//   `readOwnedSegmentVectorsByChat` present-host read. (The stickler untangle F3 corrected the prior FALSE
//   "need injected search" claim below — that applied only to the dossier/art arms, never to these two.)
// SUPERSEDED (owned elsewhere — NOT a discovery verb): tag auto-suggest. Neo's corpus tagSuggestions/apply/
//   remove are the TAG domain's review queue in orb — distill STAGES (`attachCardTagByName`, pending); the tag
//   domain OWNS list/accept/reject (`TagService.listPendingSuggestions` + `attachCardTagByName(accepted)` +
//   `detachCardTagByName`). Building it here = two homes (constitution §1). No discovery verb.
// FLAG[PD-40]: what remains needs a search/message seam (the similarity graph + similar-chats above are
//   discovery-native and now BUILT — they need NOTHING injected). Still deferred: `characterDossier.similar` +
//   image `similarArt` ("more like this avatar") need injected `search` (`search-deferred-verbs.md`); analyze
//   (`compareCharactersDeep`/`askCard`) + swipes need the semantic messages/`message_variants` read;
//   `characterDossier.portrait` needs the image cross-modal read composed into the dossier. Each lands with its
//   injected op. (The stats-composed insights `forgottenGems`/`modelRouting` are now BUILT — see above.)
// FLAG[PD-39] (tier-0/scene BUILT; tier-k/arc DEFERRED): `digest_theme_assignments.msgMidAt` — the
//   position-median story-time stamp powering `themeDrift`. Tier-0 is exact via the verbatim segment span
//   (`themes/backfill.ts` → `backfillDigestStoryTime`, also run inside `computeThemes`). Tier-k (arc) needs
//   the memory bridge-coverage `fanOut` seam (a tier-aware span read) — stays null until that lands.
// PD-22 (CLEARED) — the stats `messages-economics` read is BUILT (`domain/stats/persistence/messages-
//   economics.ts`, the D26-aware SELECTED-variant aggregation). discovery composes it ONLY through the injected
//   `characterEconomics`/`characterModelEconomics` ops (the NARROWED result types in `@orb/contracts/stats`);
//   this slice still computes NO per-character economics itself — the raw economics columns stay stats-internal.

import type { DuplicateRelation } from "@orb/contracts/discovery";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { Db } from "@orb/db";
import type {
  CharacterId,
  CharacterKeywordProfileId,
  ChatId,
  DuplicateCharacterPairId,
  DuplicateChatPairId,
  KeywordCooccurrenceId,
  ThemeClusterId,
  UserId,
} from "@orb/kit/ids";
// Type-only cross-feature SHAPE imports (depcruise domain-no-cross-feature: type-only across features is
// allowed; the runtime op is wired at the entry composition root). discovery imports no embeddings/tag/stats
// runtime — only the SHAPE of the injected ops it composes.
import type { EmbeddingsService } from "#domain/embeddings";
import type { StatsService } from "#domain/stats";
import type { TagService } from "#domain/tag";
import type {
  ArchetypesOptions,
  BrowseFilter,
  ComputeChatDuplicatesOptions,
  ComputeCooccurrenceOptions,
  ComputeDuplicatesOptions,
  ComputeHubScoresOptions,
  ComputeThemesOptions,
  DistillCharactersOptions,
  DuplicateCharactersOptions,
  DuplicateChatsOptions,
  ImageFacetKey,
  SimilarityGraphOptions,
  ThemeLevel,
  TopKeywordsOptions,
} from "./params";
import type {
  Archetype,
  BrowseCharacter,
  CatalogStats,
  CharacterComparison,
  CharacterFacets,
  CooccurrenceStats,
  CorpusPoint,
  DistillStats,
  DuplicateCharacterPair,
  DuplicateChatComputeStats,
  DuplicateChatPair,
  DuplicateComputeStats,
  ForgottenGem,
  HomeView,
  HubStats,
  ImageDuplicatePair,
  ImageFacetMember,
  ImageFacets,
  KeywordCount,
  ModelRoutingRow,
  PortraitAlignmentReport,
  SimilarChat,
  SimilarityGraph,
  StoryTimeBackfillStats,
  ThemeComputeStats,
  ThemeDetail,
  ThemeDriftBucket,
  ThemeRow,
  UnusedCharacter,
  VisualArchetype,
} from "./results";

// ── injected cross-feature ops (type-only; wired at the root) ─────────────────
/** The `hub_score` write seam — the embeddings domain's `writeHubScores` verb, bound at the entry root. The
 *  ONLY path discovery touches a vector table; it takes pre-computed scores as DATA (no CSLS math). */
export type WriteHubScores = EmbeddingsService["writeHubScores"];

/** The bound `summarize` role thunk (credential+model already bound at the root). discovery's ONLY inference
 *  surface — used for theme naming + the distill pass; it never receives `embed` (it embeds nothing). */
export type Summarize = RoleClients["summarize"];

/** The tag-staging seam — tag's `attachCardTagByName` verb, bound at the entry root (type-only `#domain/tag`
 *  SHAPE import, depcruise `domain-no-cross-feature`: type-only across features is allowed; the runtime op is
 *  wired at the root). The distill pass stages each distilled label as a `source:'auto', status:'pending'`
 *  suggestion through it — idempotent, and it NEVER downgrades an already-`accepted` row (the verb's
 *  `onConflictDoNothing`). The ONLY tag write discovery touches. */
export type AttachCardTagByName = TagService["attachCardTagByName"];

/** The stats↔discovery economics seam (PD-22, stats-discovery-seam.md Tier 2) — the two stats-OWNED
 *  economics-projection ops, bound at the entry root to `stats.characterEconomics`/`characterModelEconomics`.
 *  discovery's Tier-3 insights (`forgottenGems`/`modelRouting`) compose these NARROWED, already-aggregated
 *  results; the raw `message_variants` economics columns stay UNSPELLABLE in discovery (Knowledge-Cluster
 *  inv #5, economics ⟂ semantics). Type-only `#domain/stats` SHAPE import (the sanctioned cross-feature edge). */
export type CharacterEconomicsOp = StatsService["characterEconomics"];
export type CharacterModelEconomicsOp = StatsService["characterModelEconomics"];

// ── the standalone-compute DEPS shapes (the workload runners construct these directly) ─────────────────
// The `compute*` passes keep a `(db, deps, opts?)` standalone export (re-exported
// from the front door) so the `transport/jobs` runners (find-duplicates / compute-themes / csls) build their
// own injected ops WITHOUT threading the whole service. These are the minimal per-pass slices of the context.

/** Deps for the standalone `computeDuplicatePairs` (no inference, no hub write — pure all-pairs + persist). */
export interface ComputeDuplicatesDeps {
  readonly now: () => number;
  readonly newDuplicateCharacterPairId: () => DuplicateCharacterPairId;
}

/** Deps for the standalone `computeChatDuplicatePairs` (Jaccard + fork lineage — no inference, no hub write). */
export interface ComputeChatDuplicatesDeps {
  readonly now: () => number;
  readonly newDuplicateChatPairId: () => DuplicateChatPairId;
}

/** Deps for the standalone `computeThemes` (k-means + LLM naming via the bound `summarize` thunk). */
export interface ComputeThemesDeps {
  readonly now: () => number;
  readonly newThemeClusterId: () => ThemeClusterId;
  readonly summarize: Summarize;
}

/** Deps for the standalone `compute*HubScores` passes (the CSLS values are written through the seam). */
export interface ComputeHubScoresDeps {
  readonly writeHubScores: WriteHubScores;
}

/** The sibling-subsystem reads the composed views (`home`/`themeDetail`) depend on — injected at the entry
 *  composition root from the standalone theme/duplicate reads (a verb file may not import a sibling SUBSYSTEM
 *  subdir directly, depcruise `domain-no-cross-subsystem`; this type-only shape declares the dep). */
export interface ViewsDeps {
  readonly themes: (userId: UserId, level?: ThemeLevel) => Promise<ThemeRow[]>;
  readonly duplicateCharacters: (userId: UserId) => Promise<DuplicateCharacterPair[]>;
  readonly duplicateChats: (
    userId: UserId,
    opts?: { relation?: DuplicateRelation },
  ) => Promise<DuplicateChatPair[]>;
}

/** Deps for the standalone `computeCooccurrence` pass — the clock + the two rollup id minters (the
 *  `compute-cooccurrence` workload runner + the service factory both construct this slice). */
export interface ComputeCooccurrenceDeps {
  readonly now: () => number;
  readonly newKeywordCooccurrenceId: () => KeywordCooccurrenceId;
  readonly newCharacterKeywordProfileId: () => CharacterKeywordProfileId;
}

/** Deps for the standalone `distillCharacters` pass (PD-40 write-half). The bound `summarize` thunk + its
 *  model id (stamped on `character_summaries.model`), the injected tag-staging seam, and the clock. The
 *  `distill-characters` workload runner + the on-demand router verb both construct this slice directly. */
export interface DistillCharactersDeps {
  readonly now: () => number;
  readonly summarize: Summarize;
  readonly summarizerModel: string;
  readonly attachCardTagByName: AttachCardTagByName;
}

// ── the DI bundle (the full context the service factory closes over) ──────────
/**
 * The DI bundle the discovery verbs close over (assembled at `entry/`, surfaced via `context.ts`). It is the
 * UNION of every standalone pass's deps + the db + the read-path needs. discovery sideways-imports no sibling
 * runtime (domain-no-cross-feature) and writes NO vector row directly — `writeHubScores` is the only seam.
 */
export interface DiscoveryContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newDuplicateCharacterPairId: () => DuplicateCharacterPairId;
  readonly newThemeClusterId: () => ThemeClusterId;
  readonly summarize: Summarize;
  /** The summarize model id — stamped on `character_summaries.model` (distill provenance). Read from the
   *  bound `RoleClients.summarizerModel` at the root (the same value `summarize` is bound to). */
  readonly summarizerModel: string;
  /** The tag-staging seam (distill's ONLY tag write) — wired to `tag.attachCardTagByName` at the root. */
  readonly attachCardTagByName: AttachCardTagByName;
  readonly writeHubScores: WriteHubScores;
  /** The stats↔discovery economics seam (PD-22 — wired to `stats.characterEconomics`/`characterModelEconomics`
   *  at the entry root). The Tier-3 insights (`forgottenGems`/`modelRouting`) compose these; discovery reads
   *  no raw `messages` economics itself. */
  readonly characterEconomics: CharacterEconomicsOp;
  readonly characterModelEconomics: CharacterModelEconomicsOp;
  /** The cooccurrence rollup id minters (keyword_cooccurrence + character_keyword_profiles). */
  readonly newKeywordCooccurrenceId: () => KeywordCooccurrenceId;
  readonly newCharacterKeywordProfileId: () => CharacterKeywordProfileId;
  /** The chat near-dup pair id minter (`duplicate_chat_pairs`). */
  readonly newDuplicateChatPairId: () => DuplicateChatPairId;
}

/** What `createDiscoveryService` receives from the entry root. Identical to {@link DiscoveryContext} — no
 *  deps→context transform; the name is kept for front-door symmetry with the other domains. */
export type DiscoveryServiceDeps = DiscoveryContext;

// ── the verb interface ────────────────────────────────────────────────────────
/**
 * The discovery surface for THIS slice — duplicate-CHARACTER detection + theme/hub discovery. Every read
 * verb takes the already-resolved `UserId` (branded at the tRPC seam) and forwards it as `ownerId`; a verb
 * NEVER accepts a caller-supplied ownerId (audit #1 — the cross-user-write P0). The `compute*` passes are
 * workload-driven (no principal — global recomputes); the reads are owner-scoped.
 */
export interface DiscoveryService {
  // ── near-duplicate characters (workload compute + owner-scoped read) ────────
  /** Recompute every owner's near-duplicate CHARACTER pairs (within-owner, within-space all-pairs cosine,
   *  content-hash collapsed, CSLS-ranked) — a full atomic replace of `duplicate_character_pairs`. */
  readonly computeDuplicatePairs: (
    opts?: ComputeDuplicatesOptions,
  ) => Promise<DuplicateComputeStats>;
  /** The owner's near-duplicate character pairs, CSLS-ranked (highest first). */
  readonly duplicateCharacters: (
    userId: UserId,
    opts?: DuplicateCharactersOptions,
  ) => Promise<DuplicateCharacterPair[]>;

  // ── near-duplicate chats (the chat near-dup arm — Jaccard of segment content-hashes + fork lineage) ──
  /** Recompute every owner's near-duplicate CHAT pairs — Jaccard of segment content-hash sets (NOT centroid
   *  cosine), fork-root labelled (`forked` vs `duplicate`) — a full atomic replace of `duplicate_chat_pairs`. */
  readonly computeChatDuplicatePairs: (
    opts?: ComputeChatDuplicatesOptions,
  ) => Promise<DuplicateChatComputeStats>;
  /** The owner's near-duplicate chat pairs, Jaccard-ranked (highest first), with fork `relation`. */
  readonly duplicateChats: (
    userId: UserId,
    opts?: DuplicateChatsOptions,
  ) => Promise<DuplicateChatPair[]>;

  // ── distill (PD-40 write-half: character summaries + staged tag suggestions) ───────────────
  /** Distill each character's current card into `character_summaries` facets AND stage its distilled labels
   *  as `source:'auto', status:'pending'` tag suggestions (the Accept/Reject queue) — via the injected
   *  `summarize` role (swappable) + the `attachCardTagByName` seam. `opts.characterId` narrows to ONE card
   *  (the on-demand editor "Suggest tags" button, owner-scoped by `opts.ownerId`); absent = the whole-library
   *  batch (the `distill-characters` workload). Idempotent (upsert by characterId; no-downgrade tag attach). */
  readonly distillCharacters: (opts?: DistillCharactersOptions) => Promise<DistillStats>;

  // ── browse (PD-40 distill read-half: the filterable distilled catalog — CONTENT-only) ───────────────
  /** The owner's filterable distilled character catalog (facets + card identity), filtered/sorted/paged.
   *  CONTENT-only — no engagement counts (usage is a stats concern, composed client-side). */
  readonly browseCharacters: (userId: UserId, filter?: BrowseFilter) => Promise<BrowseCharacter[]>;
  /** The distinct genres + tones in the owner's distilled corpus (with counts) — the browse filter dropdowns. */
  readonly characterFacets: (userId: UserId) => Promise<CharacterFacets>;

  // ── catalog / compare (distill-powered analytics over character_summaries; CONTENT-only, no LLM) ──────
  /** The owner's distilled catalog overview — per-facet card counts + top tags + co-tagged pairs. */
  readonly catalog: (userId: UserId) => Promise<CatalogStats>;
  /** Compare two of the owner's distilled cards by facets (shared/distinct tags + a redundancy signal). */
  readonly compareCharacters: (
    userId: UserId,
    idA: CharacterId,
    idB: CharacterId,
  ) => Promise<CharacterComparison | null>;

  // ── archetypes + projection (owner-scoped reads; live compute over card embeddings) ──────────────────
  /** The owner's character archetypes — k-means clusters of their card embeddings, labelled from distilled
   *  facets (mode genre/tone + top tags; no LLM), largest first. */
  readonly archetypes: (userId: UserId, opts?: ArchetypesOptions) => Promise<Archetype[]>;
  /** The owner's "corpus galaxy" — every card in their primary space projected to 2D (PCA), name + genre. */
  readonly corpusProjection: (userId: UserId) => Promise<CorpusPoint[]>;

  // ── themes (workload compute + owner-scoped read) ───────────────────────────
  /** Recompute every owner's emergent themes (k-means over solo digest embeddings per level/space, full
   *  coverage assignment, LLM-named) — a full atomic replace of `theme_clusters` (+ CASCADE assignments). */
  readonly computeThemes: (opts?: ComputeThemesOptions) => Promise<ThemeComputeStats>;
  /** The owner's theme clusters at `level` (both levels when omitted), ordered by `clusterIdx`. */
  readonly themes: (userId: UserId, level?: ThemeLevel) => Promise<ThemeRow[]>;
  /** Idempotently stamp `digest_theme_assignments.msgMidAt` (position-median story-time, PD-39 — tier-0/scene
   *  only) for the owner (SINGULAR) or every owner (BULK, omitted). Runs inside `computeThemes` too. */
  readonly backfillDigestStoryTime: (ownerId?: UserId | null) => Promise<StoryTimeBackfillStats>;

  // ── insights (pure-semantics half; owner-scoped reads) ──────────────────────
  /** How the owner's themes shift over STORY time — per-month prevalence (drift), `level` default `scene`. */
  readonly themeDrift: (userId: UserId, level?: ThemeLevel) => Promise<ThemeDriftBucket[]>;
  /** The owner's characters collected but NEVER played (no `chat_participants` character seat). */
  readonly unusedCharacters: (userId: UserId) => Promise<UnusedCharacter[]>;

  // ── insights (economics-composed half; PD-22/PD-40 — composes the injected `stats` economics op) ──────
  /** Revisit candidates — characters with real invested message volume gone quiet. SEMANTIC ranking (volume
   *  + recency) in discovery; `tokensOut`/`costUsd` from the injected `characterEconomics` op. `limit`
   *  caps the list (default 20). */
  readonly forgottenGems: (userId: UserId, limit?: number) => Promise<ForgottenGem[]>;
  /** Which model the owner routes each distilled GENRE to — discovery supplies the genre, the injected
   *  `characterModelEconomics` op supplies which model performed how. One row per (genre, model). */
  readonly modelRouting: (userId: UserId) => Promise<ModelRoutingRow[]>;

  // ── image analytics (avatar-lens reads; in-RAM cosine/kmeans, caption facets) ────────────────────────
  /** Cards sharing near-identical ART (reused/duplicate avatars) — image↔image cosine per space, ranked. */
  readonly imageDuplicates: (userId: UserId, threshold?: number) => Promise<ImageDuplicatePair[]>;
  /** Art-style clusters — k-means over avatar vectors, labelled by caption artStyle/mood + distilled facets. */
  readonly visualArchetypes: (userId: UserId, k?: number) => Promise<VisualArchetype[]>;
  /** Per-character portrait↔card cross-modal alignment (PAIRED in-RAM cosine), worst-matched art first. */
  readonly portraitAlignment: (userId: UserId) => Promise<PortraitAlignmentReport>;
  /** The caption-facet distributions over the owner's captioned avatars — what the collection LOOKS like. */
  readonly imageFacets: (userId: UserId) => Promise<ImageFacets>;
  /** Drill a caption facet value to the characters whose avatar carries it (`facet` allowlisted, §7.5). */
  readonly charactersByImageFacet: (
    userId: UserId,
    facet: ImageFacetKey,
    value: string,
  ) => Promise<ImageFacetMember[]>;

  // ── similarity (discovery-native in-RAM analytics; ZERO search — the two-cosine-access-patterns rule) ──
  /** The owner's character similarity graph — all-pairs card cosine over `minSimilarity` → edges; the
   *  highest-degree characters (dense core) are the capped nodes. In-RAM (`substrate/pair-cosine`), no search. */
  readonly similarityGraph: (
    userId: UserId,
    opts?: SimilarityGraphOptions,
  ) => Promise<SimilarityGraph>;
  /** "More like THIS chat" — the k nearest chats by segment-centroid cosine, owner-scoped, self excluded.
   *  In-RAM (centroid derived at request time, NOT stored — ledger-pinned); TITLE-only hits (D28). */
  readonly similarChats: (userId: UserId, chatId: ChatId, limit?: number) => Promise<SimilarChat[]>;

  // ── composed views (CONTENT-only page bundles; owner-scoped) ────────────────
  /** The corpus HOME view — index coverage + top scene/arc themes + near-duplicate counts. */
  readonly home: (userId: UserId) => Promise<HomeView>;
  /** One theme's DETAIL view — the cluster + its story-time timeline + member characters. `null` when no
   *  cluster matches `(clusterIdx, level)`. */
  readonly themeDetail: (
    userId: UserId,
    clusterIdx: number,
    level: ThemeLevel,
  ) => Promise<ThemeDetail | null>;

  // ── cooccurrence (workload compute + owner-scoped reads) ─────────────────────
  /** Recompute every owner's keyword×keyword cooccurrence + per-character keyword profiles over their tier-0
   *  digest keywords (content-collapsed, hub-token filtered) — an atomic per-owner replace. */
  readonly computeCooccurrence: (opts?: ComputeCooccurrenceOptions) => Promise<CooccurrenceStats>;
  /** The owner's most-used distilled scene keywords (summed over their character profiles), count-descending. */
  readonly topKeywords: (userId: UserId, opts?: TopKeywordsOptions) => Promise<KeywordCount[]>;
  /** The keywords that co-occur with `keyword` in the owner's scenes, count-descending. */
  readonly cooccurringKeywords: (
    userId: UserId,
    keyword: string,
    limit?: number,
  ) => Promise<KeywordCount[]>;
  /** One character's keyword profile (the keywords its scenes anchor on), count-descending. */
  readonly characterKeywords: (
    userId: UserId,
    characterId: CharacterId,
    limit?: number,
  ) => Promise<KeywordCount[]>;

  // ── hubness (workload-driven; CSLS values written via the injected writeHubScores seam) ─────────────
  /** Compute + write `character_embeddings.hub_score` (CSLS mean-cosine, per-space, content-collapsed). */
  readonly computeCharacterHubScores: (opts?: ComputeHubScoresOptions) => Promise<HubStats>;
  /** Compute + write `chat_digests.hub_score` (grouped per (tier, space) — digests, esoteric #5). */
  readonly computeDigestHubScores: (opts?: ComputeHubScoresOptions) => Promise<number>;
  /** Compute + write `chat_segments.hub_score` (per-space). */
  readonly computeSegmentHubScores: (opts?: ComputeHubScoresOptions) => Promise<number>;
  /** Compute + write `image_embeddings.hub_score` (per-space; image↔image ONLY — never read on text→image,
   *  esoteric #2; discovery stamps it, `search` omits it cross-modally). */
  readonly computeImageHubScores: (opts?: ComputeHubScoresOptions) => Promise<number>;
}
