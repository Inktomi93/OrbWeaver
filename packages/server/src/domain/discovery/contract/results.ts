// domain/discovery/contract/results — the verb output shapes for discovery's read/compute surface.

import type { DuplicateRelation } from "@orb/contracts/discovery";
import type {
  CharacterId,
  ChatId,
  DuplicateCharacterPairId,
  DuplicateChatPairId,
  ThemeClusterId,
} from "@orb/kit/ids";
import type { ThemeLevel } from "./params";

// ── near-duplicate characters ─────────────────────────────────────────────────
/** One owner-scoped near-duplicate character pair (canonical `A<B`). `similarity` is the raw cosine;
 *  `cslsScore` is the hub-adjusted rank key (`2·cos − hub_a − hub_b`). */
export interface DuplicateCharacterPair {
  readonly id: DuplicateCharacterPairId;
  readonly characterIdA: CharacterId;
  readonly characterIdB: CharacterId;
  readonly nameA: string;
  readonly nameB: string;
  readonly similarity: number;
  readonly cslsScore: number;
  readonly model: string;
  readonly computedAt: number;
}

/** The `computeDuplicatePairs` recompute summary (a workload-runner log line). */
export interface DuplicateComputeStats {
  readonly ownersProcessed: number;
  readonly charactersScanned: number;
  readonly pairsWritten: number;
}

/** One owner-scoped near-duplicate chat pair (canonical `A<B`). `similarity` is the Jaccard overlap of the
 *  two chats' segment content-hash sets, not centroid cosine. `relation` is `forked` vs `duplicate`. */
export interface DuplicateChatPair {
  readonly id: DuplicateChatPairId;
  readonly chatIdA: ChatId;
  readonly chatIdB: ChatId;
  readonly titleA: string | null;
  readonly titleB: string | null;
  readonly similarity: number;
  readonly cslsScore: number;
  readonly relation: DuplicateRelation;
  readonly model: string;
  readonly computedAt: number;
}

/** The `computeChatDuplicatePairs` recompute summary. */
export interface DuplicateChatComputeStats {
  readonly ownersProcessed: number;
  readonly chatsScanned: number;
  readonly pairsWritten: number;
}

// ── themes ────────────────────────────────────────────────────────────────────
/** One owner-scoped emergent theme cluster (k-means over digest embeddings, LLM-named). `name` is null
 *  until the naming pass runs or the cluster is below the name-worthiness floor. */
export interface ThemeRow {
  readonly id: ThemeClusterId;
  readonly level: ThemeLevel;
  readonly clusterIdx: number;
  readonly name: string | null;
  readonly size: number;
  readonly model: string;
  readonly computedAt: number;
}

/** The `computeThemes` recompute summary. */
export interface ThemeComputeStats {
  readonly ownersProcessed: number;
  readonly clustersWritten: number;
  readonly digestsAssigned: number;
}

// ── distill (character summaries + staged tag suggestions) ───────────────────────────
/** The distilled facets parsed from one character's `summarize` reply (null scalar = model omitted it). */
export interface CharacterDistillation {
  readonly genre: string | null;
  readonly tone: string | null;
  readonly setting: string | null;
  readonly subGenres: string[];
  readonly tags: string[];
  readonly elevatorPitch: string | null;
  readonly overview: string | null;
}

/** The `distillCharacters` pass summary. */
export interface DistillStats {
  readonly scanned: number;
  readonly distilled: number;
  readonly failed: number;
  readonly tagsStaged: number;
}

// ── browse (the filterable distilled catalog) ──────────────────────────────────────
/** One row of the owner's distilled character catalog — card identity plus distilled facets, content-only. */
export interface BrowseCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly setting: string | null;
  readonly tags: string[];
  readonly elevatorPitch: string | null;
  readonly avatarHash: string | null;
  readonly createdAt: number;
}

/** One facet value + how many of the owner's distilled cards carry it (populates a filter dropdown). */
export interface FacetCount {
  readonly value: string;
  readonly count: number;
}

/** The distinct genres + tones in the owner's distilled corpus, each with its card count (descending). */
export interface CharacterFacets {
  readonly genres: FacetCount[];
  readonly tones: FacetCount[];
}

// ── archetypes (k-means over card embeddings, labelled from distilled facets — no LLM) ──────────────────
/** One character in an archetype cluster (the display slice — capped in the verb). */
export interface ArchetypeMember {
  readonly characterId: CharacterId;
  readonly name: string;
}

/** One character archetype — a k-means cluster of an owner's card embeddings, labelled from the dominant
 *  distilled facets. `size` is the full member count; `members` is a bounded display slice. */
export interface Archetype {
  readonly label: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly topTags: string[];
  readonly size: number;
  readonly members: ArchetypeMember[];
  readonly model: string;
}

/** One point in the corpus "galaxy" — a character's card embedding projected to 2D (PCA). */
export interface CorpusPoint {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly x: number;
  readonly y: number;
}

// ── similarity (character graph + similar chats — discovery-native in-RAM, zero search) ─────────────────
/** One node in the character similarity graph — a kept (dense-core) character. `degree` is its edge count. */
export interface SimilarityGraphNode {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly degree: number;
  readonly genre: string | null;
}

/** One edge — a character pair whose raw card-embedding cosine cleared `minSimilarity`. */
export interface SimilarityGraphEdge {
  readonly source: CharacterId;
  readonly target: CharacterId;
  readonly similarity: number;
}

/** The character similarity graph — dense-core nodes (highest-degree, capped) + edges between kept nodes. */
export interface SimilarityGraph {
  readonly nodes: SimilarityGraphNode[];
  readonly edges: SimilarityGraphEdge[];
}

/** One "more like THIS chat" hit — a chat whose segment centroid is nearest the target chat's centroid. */
export interface SimilarChat {
  readonly chatId: ChatId;
  readonly title: string | null;
  readonly similarity: number;
}

// ── cooccurrence (keyword×keyword tallies; per-character keyword profiles) ──────────────────────────────
/** One keyword + its count (a `topKeywords` / `characterKeywords` / `cooccurringKeywords` row). */
export interface KeywordCount {
  readonly keyword: string;
  readonly count: number;
}

/** The `computeCooccurrence` recompute summary. */
export interface CooccurrenceStats {
  readonly ownersProcessed: number;
  readonly pairsWritten: number;
  readonly charKeywordsWritten: number;
  readonly hubTokensDropped: number;
}

// ── catalog / compare (distill-powered analytics over character_summaries; SQL, no LLM) ─────────────────
/** One distilled tag + how many of the owner's cards carry it (case-folded). */
export interface TagCount {
  readonly tag: string;
  readonly count: number;
}

/** Two distilled tags that co-occur on the same card + how often. Canonical `a < b` (case-folded). */
export interface TagPair {
  readonly a: string;
  readonly b: string;
  readonly count: number;
}

/** The distill-powered catalog overview — what the owner actually collected, content-only. */
export interface CatalogStats {
  readonly genres: FacetCount[];
  readonly tones: FacetCount[];
  readonly topTags: TagCount[];
  readonly tagPairs: TagPair[];
  readonly totalDistilled: number;
}

/** One side of a `compareCharacters` diff — the card identity + its headline distilled facets. */
export interface ComparedCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly pitch: string | null;
}

/** A two-character facet diff (no LLM) — shared vs distinct tags + a redundancy signal (tag Jaccard). */
export interface CharacterComparison {
  readonly a: ComparedCharacter;
  readonly b: ComparedCharacter;
  readonly sameGenre: boolean;
  readonly sameTone: boolean;
  readonly sharedTags: string[];
  readonly onlyA: string[];
  readonly onlyB: string[];
  readonly redundancy: number;
}

// ── insights (pure-semantics half: themeDrift + unusedCharacters) ───────────────────────────────────────
/** One theme's prevalence within a story-time month bucket. `themeName` is null below the name-worthiness floor. */
export interface ThemeDriftTheme {
  readonly clusterIdx: number;
  readonly themeName: string | null;
  readonly count: number;
}

/** How the owner's themes shift over story time — per-month theme prevalence, bucket-ascending. */
export interface ThemeDriftBucket {
  readonly bucket: string;
  readonly themes: ThemeDriftTheme[];
}

/** A character collected but never played (no `chat_participants` character seat). */
export interface UnusedCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** The `backfillDigestStoryTime` summary — how many tier-0 assignment rows got a `msgMidAt` stamp. */
export interface StoryTimeBackfillStats {
  readonly stamped: number;
}

// ── insights (economics-composed half: forgottenGems + modelRouting) ──────────────────────
/** A "forgotten gem" — a character with real invested message volume gone quiet. `tokensOut`/`costUsd` are
 *  sourced from the injected `stats` op, never a raw `messages` sum in discovery. */
export interface ForgottenGem {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly messageCount: number;
  readonly lastActiveAt: number;
  readonly tokensOut: number;
  readonly costUsd: number;
}

/** One (genre, model) routing row — which model was used for the owner's distilled genre and how it performed. */
export interface ModelRoutingRow {
  readonly genre: string;
  readonly model: string;
  readonly provider: string | null;
  readonly generations: number;
  readonly tokensOut: number;
  readonly avgGenTimeMs: number | null;
  readonly costUsd: number;
}

// ── composed views (content-only server verbs — home + themeDetail) ─────────────────────────────────────
/** Corpus coverage — how much of the owner's library is indexed (not usage). */
export interface CorpusCoverage {
  readonly characters: number;
  readonly digests: number;
  readonly segments: number;
}

/** The corpus home view — index coverage + top scene/arc themes + near-duplicate counts. */
export interface HomeView {
  readonly coverage: CorpusCoverage;
  readonly topSceneThemes: ThemeRow[];
  readonly topArcThemes: ThemeRow[];
  readonly duplicateCounts: { readonly characters: number; readonly chats: number };
}

/** One character's presence in a theme cluster (its digest count in the cluster). */
export interface ThemeMember {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly count: number;
}

/** One theme's detail view — the cluster row + its story-time timeline + the characters most present in it. */
export interface ThemeDetail {
  readonly id: ThemeClusterId;
  readonly level: ThemeLevel;
  readonly clusterIdx: number;
  readonly name: string | null;
  readonly size: number;
  readonly model: string;
  readonly timeline: { readonly bucket: string; readonly count: number }[];
  readonly members: ThemeMember[];
}

// ── image analytics (avatar-lens: duplicates / visual archetypes / portrait alignment / caption facets) ──
/** One pair of cards sharing near-identical art (reused/duplicate avatars). `similarity` is the raw
 *  image↔image cosine. */
export interface ImageDuplicatePair {
  readonly characterIdA: CharacterId;
  readonly nameA: string;
  readonly characterIdB: CharacterId;
  readonly nameB: string;
  readonly similarity: number;
}

/** One art-style cluster — k-means over avatar vectors, labelled by dominant caption artStyle/mood. */
export interface VisualArchetype {
  readonly label: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly artStyle: string | null;
  readonly palette: string | null;
  readonly mood: string | null;
  readonly size: number;
  readonly members: ArchetypeMember[];
  readonly model: string;
}

/** One character's portrait↔card cross-modal alignment (paired in-RAM cosine). Low = art doesn't match writing. */
export interface PortraitAlignment {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly alignment: number;
  readonly rating: string | null;
  readonly artStyle: string | null;
}

/** The portrait-alignment report — every scored character (worst-matched art first) + the distribution. */
export interface PortraitAlignmentReport {
  readonly count: number;
  readonly mean: number;
  readonly median: number;
  readonly characters: PortraitAlignment[];
}

/** The caption-derived visual facet distributions over the owner's current-avatar corpus. */
export interface ImageFacets {
  readonly total: number;
  readonly artStyles: FacetCount[];
  readonly ratings: FacetCount[];
  readonly shotTypes: FacetCount[];
  readonly cameraAngles: FacetCount[];
  readonly genders: FacetCount[];
  readonly coverage: FacetCount[];
  readonly bodyTypes: FacetCount[];
  readonly chestSizes: FacetCount[];
  readonly skinTones: FacetCount[];
  readonly outfitTypes: FacetCount[];
  readonly clothingStates: FacetCount[];
  readonly nudityLevels: FacetCount[];
  readonly exposedParts: FacetCount[];
  readonly topTags: FacetCount[];
}

/** One character behind a facet chip — the drill from a facet value to its avatars. */
export interface ImageFacetMember {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly rating: string | null;
  readonly artStyle: string | null;
  readonly caption: string | null;
}

// ── hubness ─────────────────────────────────────────────────────────────────
/** The `computeCharacterHubScores` summary. */
export interface HubStats {
  readonly rowsScored: number;
  readonly groupsProcessed: number;
}
