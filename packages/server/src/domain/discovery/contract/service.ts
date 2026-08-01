// domain/discovery/contract/service — the typed API surface: context, service deps, and DiscoveryService.
// discovery embeds nothing and writes no vector row directly; hub_score is written via the injected
// writeHubScores seam; characterDossier's neighbours arrive via the injected `similar` search seam (wired at
// the root — type-only here). analyze/swipes read the SEMANTIC messages projection (content, never economics).

import type { DuplicateRelation } from "@orb/contracts/discovery";
import type { RoleClients } from "@orb/contracts/role-clients";
import type { UserSettings } from "@orb/contracts/settings";
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
import type { SideGenSampling } from "@orb/kit/side-gen-posture";
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
  AskCardAnswer,
  BrowseCharacter,
  CatalogStats,
  CharacterComparison,
  CharacterComparisonDeep,
  CharacterDossier,
  CharacterFacets,
  CooccurrenceStats,
  CorpusPoint,
  DistillStats,
  DossierNeighbor,
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
  SwipeHotspot,
  ThemeComputeStats,
  ThemeDetail,
  ThemeDriftBucket,
  ThemeRow,
  UnusedCharacter,
  VisualArchetype,
} from "./results";

// ── injected cross-feature ops (type-only; wired at the root) ─────────────────
/** The `hub_score` write seam — the embeddings domain's `writeHubScores` verb, bound at the entry root. */
type WriteHubScores = EmbeddingsService["writeHubScores"];

/** The bound `summarize` role thunk — discovery's only inference surface (theme naming + distill). */
export type Summarize = RoleClients["summarize"];

/** The side-gen sampling ladder's middle rung — a user's default-preset generation params, resolved at the
 *  entry root (the caller of distill/analyze is the card owner). Bound type-only here (discovery never reads
 *  the preset domain); the runtime resolver is wired at compose. */
type ResolveUserPresetParams = (userId: UserId) => Promise<SideGenSampling>;

/** The tag-staging seam — tag's `attachCardTagByName` verb, bound at the entry root; distill's only tag write. */
type AttachCardTagByName = TagService["attachCardTagByName"];

/** The stats↔discovery economics seam — bound at the entry root to stats' economics-projection ops. */
type CharacterEconomicsOp = StatsService["characterEconomics"];
type CharacterModelEconomicsOp = StatsService["characterModelEconomics"];

// ── the standalone-compute DEPS shapes (the workload runners construct these directly) ─────────────────

/** Deps for the standalone `computeDuplicatePairs`. */
export interface ComputeDuplicatesDeps {
  readonly now: () => number;
  readonly newDuplicateCharacterPairId: () => DuplicateCharacterPairId;
}

/** Deps for the standalone `computeChatDuplicatePairs`. */
export interface ComputeChatDuplicatesDeps {
  readonly now: () => number;
  readonly newDuplicateChatPairId: () => DuplicateChatPairId;
}

/** The tier-0 blockIdx range a tier-`k` digest covers — the memory tier-grid seam (PD-39). The fanOut math
 *  stays ONE-HOMED in chat/memory (`resolveTier0Range`); discovery receives the resolver bound over the live
 *  memory config at the entry root and never spells `fanOut` itself. Tier 0 is the identity range. */
export type Tier0RangeOp = (tier: number, blockIdx: number) => { readonly startIdx: number; readonly endIdx: number };

/** Deps for the standalone `computeThemes`. */
export interface ComputeThemesDeps {
  readonly now: () => number;
  readonly newThemeClusterId: () => ThemeClusterId;
  readonly summarize: Summarize;
  /** Threaded into the tier-k `msgMidAt` backfill `computeThemes` runs after every replace. */
  readonly tier0RangeOf: Tier0RangeOp;
}

/** Deps for the standalone `compute*HubScores` passes. */
export interface ComputeHubScoresDeps {
  readonly writeHubScores: WriteHubScores;
}

/** Sibling-subsystem reads the composed views (`home`/`themeDetail`/`characterDossier`) depend on, injected
 *  at the entry root. `themes`/`duplicate*` come from discovery's OWN verbs (self-composition); `similar` is
 *  the one CROSS-domain member — search's `similarCharacters`, narrowed to {@link DossierNeighbor} at the root. */
export interface ViewsDeps {
  readonly themes: (userId: UserId, level?: ThemeLevel) => Promise<ThemeRow[]>;
  readonly duplicateCharacters: (userId: UserId) => Promise<DuplicateCharacterPair[]>;
  readonly duplicateChats: (userId: UserId, opts?: { relation?: DuplicateRelation }) => Promise<DuplicateChatPair[]>;
  readonly similar: (userId: UserId, characterId: CharacterId, topN: number) => Promise<DossierNeighbor[]>;
}

/** Deps for the standalone `computeCooccurrence` pass. */
export interface ComputeCooccurrenceDeps {
  readonly now: () => number;
  readonly newKeywordCooccurrenceId: () => KeywordCooccurrenceId;
  readonly newCharacterKeywordProfileId: () => CharacterKeywordProfileId;
}

/** The one cross-verb dep for `analyze` — `catalog.compareCharacters`, injected at `service.ts` (verb-to-verb
 *  value deps are wired explicitly, never sideways-imported; domain-no-cross-verb). `compareCharactersDeep`
 *  decorates its owner-belted facet diff with an LLM narrative (one home for the diff logic — no doubling). */
export interface AnalyzeDeps {
  readonly compareCharacters: DiscoveryService["compareCharacters"];
}

/** Deps for the standalone `distillCharacters` pass. */
export interface DistillCharactersDeps {
  readonly now: () => number;
  readonly summarize: Summarize;
  readonly summarizerModel: string;
  readonly attachCardTagByName: AttachCardTagByName;
  /** The card owner's default-preset params (the side-gen sampling ladder's middle rung). The whole-library
   *  batch has no single owner ⇒ the floor stands; the on-demand single-card pass folds `opts.ownerId`'s. */
  readonly resolveUserPresetParams: ResolveUserPresetParams;
}

// ── the DI bundle (the full context the service factory closes over) ──────────
/** The DI bundle the discovery verbs close over (assembled at `entry/`, surfaced via `context.ts`). */
export interface DiscoveryContext {
  readonly db: Db;
  readonly now: () => number;
  readonly newDuplicateCharacterPairId: () => DuplicateCharacterPairId;
  readonly newThemeClusterId: () => ThemeClusterId;
  readonly summarize: Summarize;
  readonly summarizerModel: string;
  readonly attachCardTagByName: AttachCardTagByName;
  /** The side-gen sampling ladder's middle rung — the card owner's default-preset params (distill + analyze). */
  readonly resolveUserPresetParams: ResolveUserPresetParams;
  readonly writeHubScores: WriteHubScores;
  readonly characterEconomics: CharacterEconomicsOp;
  readonly characterModelEconomics: CharacterModelEconomicsOp;
  readonly newKeywordCooccurrenceId: () => KeywordCooccurrenceId;
  readonly newCharacterKeywordProfileId: () => CharacterKeywordProfileId;
  readonly newDuplicateChatPairId: () => DuplicateChatPairId;
  /** The memory tier-grid seam (PD-39) — `chat/memory.resolveTier0Range` bound over the live
   *  `AppSettings.memoryDefaults` at the entry root; powers the tier-k `msgMidAt` backfill arm. */
  readonly tier0RangeOf: Tier0RangeOp;
  /** The cross-domain `similar` seam — search's `similarCharacters`, narrowed to {@link DossierNeighbor} and
   *  bound at the entry root. discovery's only retrieval dependency (analytics ≠ retrieval); enters here so it
   *  threads into the {@link ViewsDeps} the service builds. */
  readonly similar: (userId: UserId, characterId: CharacterId, topN: number) => Promise<DossierNeighbor[]>;
}

/** What `createDiscoveryService` receives from the entry root; identical to {@link DiscoveryContext}. */
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
  readonly computeDuplicatePairs: (opts?: ComputeDuplicatesOptions) => Promise<DuplicateComputeStats>;
  /** The owner's near-duplicate character pairs, CSLS-ranked (highest first). */
  readonly duplicateCharacters: (userId: UserId, opts?: DuplicateCharactersOptions) => Promise<DuplicateCharacterPair[]>;

  // ── near-duplicate chats (the chat near-dup arm — Jaccard of segment content-hashes + fork lineage) ──
  /** Recompute every owner's near-duplicate CHAT pairs — Jaccard of segment content-hash sets (NOT centroid
   *  cosine), fork-root labelled (`forked` vs `duplicate`) — a full atomic replace of `duplicate_chat_pairs`. */
  readonly computeChatDuplicatePairs: (opts?: ComputeChatDuplicatesOptions) => Promise<DuplicateChatComputeStats>;
  /** The owner's near-duplicate chat pairs, Jaccard-ranked (highest first), with fork `relation`. */
  readonly duplicateChats: (userId: UserId, opts?: DuplicateChatsOptions) => Promise<DuplicateChatPair[]>;

  // ── distill (character summaries + staged tag suggestions) ───────────────
  /** Distill a character's card into `character_summaries` facets and stage its labels as pending tag
   *  suggestions. `opts.characterId` narrows to ONE card; absent = whole-library batch. Idempotent. */
  readonly distillCharacters: (opts?: DistillCharactersOptions) => Promise<DistillStats>;

  // ── browse (the filterable distilled catalog — CONTENT-only) ───────────────
  /** The owner's filterable distilled character catalog (facets + card identity), filtered/sorted/paged. */
  readonly browseCharacters: (userId: UserId, filter?: BrowseFilter) => Promise<BrowseCharacter[]>;
  /** The distinct genres + tones in the owner's distilled corpus (with counts) — the browse filter dropdowns. */
  readonly characterFacets: (userId: UserId) => Promise<CharacterFacets>;

  // ── catalog / compare (distill-powered analytics over character_summaries; CONTENT-only, no LLM) ──────
  /** The owner's distilled catalog overview — per-facet card counts + top tags + co-tagged pairs. */
  readonly catalog: (userId: UserId) => Promise<CatalogStats>;
  /** Compare two of the owner's distilled cards by facets (shared/distinct tags + a redundancy signal). */
  readonly compareCharacters: (userId: UserId, idA: CharacterId, idB: CharacterId) => Promise<CharacterComparison | null>;

  // ── analyze (semantic understanding — LLM narrative over the diff + grounded card Q&A) ──────────────
  /** {@link compareCharacters} plus a grounded LLM narrative over the same diff. null on self/foreign/undistilled. */
  readonly compareCharactersDeep: (userId: UserId, idA: CharacterId, idB: CharacterId) => Promise<CharacterComparisonDeep | null>;
  /** Answer a free-text question about ONE owned/distilled character from its recent PLAYED scenes (SEMANTIC
   *  content only). null when the character isn't owned/distilled. */
  readonly askCard: (userId: UserId, characterId: CharacterId, question: string) => Promise<AskCardAnswer | null>;

  // ── swipes (regeneration hotspots — the assistant slots with the most alternate takes in one chat) ──
  /** The owner's chat's assistant slots with \>1 variant (re-rolled spots), most takes first (default 20).
   *  Owner-belted via `characters.ownerId` — a foreign chat returns [] (no leak). */
  readonly swipeHotspots: (userId: UserId, chatId: ChatId, limit?: number) => Promise<SwipeHotspot[]>;

  // ── archetypes + projection (owner-scoped reads; live compute over card embeddings) ──────────────────
  /** The owner's character archetypes — k-means clusters of their card embeddings, largest first. */
  readonly archetypes: (userId: UserId, opts?: ArchetypesOptions) => Promise<Archetype[]>;
  /** The owner's "corpus galaxy" — every card in their primary space projected to 2D (PCA), name + genre. */
  readonly corpusProjection: (userId: UserId) => Promise<CorpusPoint[]>;

  // ── themes (workload compute + owner-scoped read) ───────────────────────────
  /** Recompute every owner's emergent themes — a full atomic replace of `theme_clusters` (+ assignments). */
  readonly computeThemes: (opts?: ComputeThemesOptions) => Promise<ThemeComputeStats>;
  /** The owner's theme clusters at `level` (both levels when omitted), ordered by `clusterIdx`. */
  readonly themes: (userId: UserId, level?: ThemeLevel) => Promise<ThemeRow[]>;
  /** Idempotently stamp `digest_theme_assignments.msgMidAt` for the owner, or every owner when omitted. */
  readonly backfillDigestStoryTime: (ownerId?: UserId | null) => Promise<StoryTimeBackfillStats>;

  // ── insights (pure-semantics half; owner-scoped reads) ──────────────────────
  /** How the owner's themes shift over STORY time — per-month prevalence (drift), `level` default `scene`. */
  readonly themeDrift: (userId: UserId, level?: ThemeLevel) => Promise<ThemeDriftBucket[]>;
  /** The owner's characters collected but NEVER played (no `chat_participants` character seat). */
  readonly unusedCharacters: (userId: UserId) => Promise<UnusedCharacter[]>;

  // ── insights (economics-composed half — composes the injected `stats` economics op) ──────
  /** Revisit candidates — characters with real invested message volume gone quiet (default limit 20). */
  readonly forgottenGems: (userId: UserId, limit?: number) => Promise<ForgottenGem[]>;
  /** Which model the owner routes each distilled genre to — one row per (genre, model). */
  readonly modelRouting: (userId: UserId) => Promise<ModelRoutingRow[]>;

  // ── image analytics (avatar-lens reads; in-RAM cosine/kmeans, caption facets) ────────────────────────
  /** Cards sharing near-identical ART (reused/duplicate avatars) — image↔image cosine per space, ranked. */
  readonly imageDuplicates: (userId: UserId, threshold?: number) => Promise<ImageDuplicatePair[]>;
  /** Art-style clusters — k-means over avatar vectors, labelled by caption artStyle/mood + distilled facets. */
  readonly visualArchetypes: (userId: UserId, k?: number) => Promise<VisualArchetype[]>;
  /** Per-character portrait↔card cross-modal alignment, worst-matched art first. */
  readonly portraitAlignment: (userId: UserId) => Promise<PortraitAlignmentReport>;
  /** The caption-facet distributions over the owner's captioned avatars. */
  readonly imageFacets: (userId: UserId) => Promise<ImageFacets>;
  /** Drill a caption facet value to the characters whose avatar carries it. */
  readonly charactersByImageFacet: (userId: UserId, facet: ImageFacetKey, value: string) => Promise<ImageFacetMember[]>;

  // ── similarity (discovery-native in-RAM analytics; ZERO search — the two-cosine-access-patterns rule) ──
  /** The owner's character similarity graph — all-pairs card cosine over `minSimilarity` → edges. */
  readonly similarityGraph: (userId: UserId, opts?: SimilarityGraphOptions) => Promise<SimilarityGraph>;
  /** "More like THIS chat" — the k nearest chats by segment-centroid cosine, owner-scoped, self excluded. */
  readonly similarChats: (userId: UserId, chatId: ChatId, limit?: number) => Promise<SimilarChat[]>;

  // ── composed views (CONTENT-only page bundles; owner-scoped) ────────────────
  /** The corpus HOME view — index coverage + top scene/arc themes + near-duplicate counts. */
  readonly home: (userId: UserId) => Promise<HomeView>;
  /** One theme's DETAIL view — the cluster + its story-time timeline + member characters, `null` if no match. */
  readonly themeDetail: (userId: UserId, clusterIdx: number, level: ThemeLevel) => Promise<ThemeDetail | null>;
  /** One character's composed DOSSIER — distilled headline facets + portrait↔card alignment (in-RAM cosine) +
   *  nearest neighbours (the injected `similar` search seam). `null` when the character isn't owned/distilled. */
  readonly characterDossier: (userId: UserId, characterId: CharacterId) => Promise<CharacterDossier | null>;

  // ── cooccurrence (workload compute + owner-scoped reads) ─────────────────────
  /** Recompute every owner's keyword×keyword cooccurrence + per-character keyword profiles — atomic per-owner replace. */
  readonly computeCooccurrence: (opts?: ComputeCooccurrenceOptions) => Promise<CooccurrenceStats>;
  /** The owner's most-used distilled scene keywords (summed over their character profiles), count-descending. */
  readonly topKeywords: (userId: UserId, opts?: TopKeywordsOptions) => Promise<KeywordCount[]>;
  /** The keywords that co-occur with `keyword` in the owner's scenes, count-descending. */
  readonly cooccurringKeywords: (userId: UserId, keyword: string, limit?: number) => Promise<KeywordCount[]>;
  /** One character's keyword profile (the keywords its scenes anchor on), count-descending. */
  readonly characterKeywords: (userId: UserId, characterId: CharacterId, limit?: number) => Promise<KeywordCount[]>;

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

/** What the domain's `WorkloadContribution` factory needs from the composition root (the five analytics
 *  kinds) — this domain's own verbs, plus the triggering user's settings (the tunable precedence's middle
 *  rung: per-run param → this knob → the domain's own floor). */
export interface DiscoveryWorkloadDeps {
  readonly discovery: Pick<
    DiscoveryService,
    "computeThemes" | "distillCharacters" | "computeCooccurrence" | "computeDuplicatePairs" | "computeChatDuplicatePairs" | "computeCharacterHubScores"
  >;
  readonly loadUserSettings: (userId: UserId) => Promise<UserSettings>;
}
