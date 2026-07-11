// domain/discovery/contract/results — the verb output shapes for the duplicate-character + theme/hub slice.
// (The fuller corpus surface — Browse/Catalog/Archetype/Insights/Image/Cooccurrence/Tag/Views — is FLAG[PD-40];
// those result shapes join with their verbs in a later wave. See contract/service.ts for the deferral list.)

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
/** One owner-scoped near-duplicate CHARACTER pair (canonical `A<B`). `similarity` is the raw card-embedding
 *  cosine; `cslsScore` is the hub-adjusted rank key (`2·cos − hub_a − hub_b` — a generic/hub card is
 *  deflated). `nameA`/`nameB` are the live card names for display. `model` is the embedding-space tag the
 *  pair was computed in (a pair is only meaningful within one space). No `relation` — characters have no
 *  fork lineage (D27/D28); a character pair is always an accidental look-alike (schema/discovery.ts). */
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

/** One owner-scoped near-duplicate CHAT pair (canonical `A<B`). `similarity` is the Jaccard overlap of the two
 *  chats' segment content-hash sets (NOT centroid cosine — a per-chat centroid is dominated by the character's
 *  persistent voice, so same-character chats falsely score high). `relation` is `forked` (a shared fork-root
 *  family, via the `chats.parentChatId` lineage walk) vs `duplicate` (an independent look-alike). `titleA`/
 *  `titleB` are the chat titles for display (null when untitled). `model` is a fixed sentinel — the arm is
 *  content-hash based, not embedding-space specific. */
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
/** One owner-scoped emergent theme cluster (k-means over digest embeddings, LLM-named). `clusterIdx` is the
 *  stable address within (owner, level); `name` is null until the naming pass runs OR the cluster is below
 *  the name-worthiness floor; `size` is the FULL-space member count (NOT the content-collapsed rep count —
 *  esoteric #3). `model` is the embedding-space tag the centroid lives in. */
export interface ThemeRow {
  readonly id: ThemeClusterId;
  readonly level: ThemeLevel;
  readonly clusterIdx: number;
  readonly name: string | null;
  readonly size: number;
  readonly model: string;
  readonly computedAt: number;
}

/** The `computeThemes` recompute summary. `clustersWritten` counts clusters across all (owner, level, space)
 *  partitions; `digestsAssigned` counts the full-coverage assignment rows. */
export interface ThemeComputeStats {
  readonly ownersProcessed: number;
  readonly clustersWritten: number;
  readonly digestsAssigned: number;
}

// ── distill (PD-40 write-half: character summaries + staged tag suggestions) ───────────────────────────
/** The distilled facets parsed from ONE character's `summarize` reply (a null scalar = the model omitted it).
 *  `subGenres`/`tags` default to `[]` (always-a-list). `tags` are the descriptive labels the pass stages as
 *  `source:'auto', status:'pending'` tag-domain suggestions (the Accept/Reject queue); the rest fill the
 *  `character_summaries` row. Guided-decode keeps `genre`/`tone` inside the discovery-local GENRES/TONES
 *  grammar (verbs/distill.ts), so the db columns stay plain TEXT (schema/discovery.ts header). */
export interface CharacterDistillation {
  readonly genre: string | null;
  readonly tone: string | null;
  readonly setting: string | null;
  readonly subGenres: string[];
  readonly tags: string[];
  readonly elevatorPitch: string | null;
  readonly overview: string | null;
}

/** The `distillCharacters` pass summary (workload-runner / on-demand log line). `scanned` = cards read;
 *  `distilled` = `character_summaries` rows upserted; `failed` = replies that didn't parse; `tagsStaged` =
 *  pending suggestion junction rows NEWLY attached (an already-present/accepted tag doesn't re-count —
 *  idempotent). */
export interface DistillStats {
  readonly scanned: number;
  readonly distilled: number;
  readonly failed: number;
  readonly tagsStaged: number;
}

// ── browse (distill read-half: the filterable distilled catalog) ──────────────────────────────────────
/** One row of the owner's distilled character catalog — the card identity (name + avatar) plus its distilled
 *  facets. CONTENT-only: NO engagement/usage counts (chats/last-played are a stats concern composed
 *  client-side — the Knowledge-Cluster fence). `avatarHash` is the CAS hash of the card's current avatar (null
 *  when unset); `createdAt` is the character's collected date (the `recent` sort key + display). */
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

/** The distinct genres + tones present in the owner's distilled corpus, each with its card count (descending).
 *  Powers the browse filter dropdowns. */
export interface CharacterFacets {
  readonly genres: FacetCount[];
  readonly tones: FacetCount[];
}

// ── archetypes (k-means over CARD embeddings, labelled from distilled facets — no LLM) ──────────────────
/** One character in an archetype cluster (the display slice — capped in the verb). */
export interface ArchetypeMember {
  readonly characterId: CharacterId;
  readonly name: string;
}

/** One character ARCHETYPE — a k-means cluster of an owner's card embeddings, labelled cheaply from the
 *  dominant distilled facets (mode genre/tone + top tags; no LLM). `label` composes `"<tone> <genre>"`
 *  (falling back to `"mixed"`); `size` is the FULL member count; `members` is a bounded display slice.
 *  `model` is the embedding space the cluster lives in (a cluster is only meaningful within one space). */
export interface Archetype {
  readonly label: string;
  readonly genre: string | null;
  readonly tone: string | null;
  readonly topTags: string[];
  readonly size: number;
  readonly members: ArchetypeMember[];
  readonly model: string;
}

/** One point in the corpus "galaxy" — a character's card embedding projected to 2D (PCA). Colored
 *  client-side by distilled `genre`. */
export interface CorpusPoint {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly genre: string | null;
  readonly x: number;
  readonly y: number;
}

// ── similarity (character graph + similar chats — discovery-native in-RAM, zero search) ─────────────────
/** One node in the character similarity graph — a kept (dense-core) character. `degree` is its edge count
 *  (higher = more like-alikes); `genre` is the distilled label the client colors by (null when undistilled). */
export interface SimilarityGraphNode {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly degree: number;
  readonly genre: string | null;
}

/** One edge — a character pair whose RAW card-embedding cosine cleared `minSimilarity`. `source`/`target` are
 *  the endpoint character ids; `similarity` is the raw cosine (undirected, so the pair appears once). */
export interface SimilarityGraphEdge {
  readonly source: CharacterId;
  readonly target: CharacterId;
  readonly similarity: number;
}

/** The character similarity graph — the dense-core nodes (highest-degree, capped) + the edges between kept
 *  nodes. A force-directed "who reads like whom" map (all-pairs in-RAM cosine, NOT search top-k). */
export interface SimilarityGraph {
  readonly nodes: SimilarityGraphNode[];
  readonly edges: SimilarityGraphEdge[];
}

/** One "more like THIS chat" hit — a chat whose segment centroid is nearest the target chat's centroid.
 *  `title` is the chat's display title (null when untitled); `similarity` is the centroid cosine. Orb chats
 *  have no `characterVersionId` (D28 — multi-participant), so the hit is TITLE-only (no character name). */
export interface SimilarChat {
  readonly chatId: ChatId;
  readonly title: string | null;
  readonly similarity: number;
}

// ── cooccurrence (keyword×keyword tallies; per-character keyword profiles) ──────────────────────────────
/** One keyword + its count (a `topKeywords` / `characterKeywords` / `cooccurringKeywords` row). The orb
 *  `keyword_cooccurrence` table stores NO sampled `characterIds` (neo's extra column is dropped) — a
 *  co-occurring pair is a bare weight, so all three keyword reads share this shape. */
export interface KeywordCount {
  readonly keyword: string;
  readonly count: number;
}

/** The `computeCooccurrence` recompute summary. `pairsWritten` counts `keyword_cooccurrence` rows across all
 *  owners (top-N capped per owner); `charKeywordsWritten` counts `character_keyword_profiles` rows;
 *  `hubTokensDropped` counts the hub keywords filtered out (over `hubFraction` of an owner's digests). */
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

/** Two distilled tags that co-occur on the same card + how often (the "enemies-to-lovers also tagged NSFW"
 *  view). Canonical `a < b` (case-folded). */
export interface TagPair {
  readonly a: string;
  readonly b: string;
  readonly count: number;
}

/** The distill-powered CATALOG overview — what the owner actually collected (CONTENT-only: NO engagement/
 *  played counts, which are a stats concern). `genres`/`tones` are the per-facet card counts (descending);
 *  `topTags` the most-common distilled tags; `tagPairs` the co-tagged pairs; `totalDistilled` the corpus size. */
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

/** A two-character facet diff (no LLM) — shared vs distinct tags + a cheap redundancy signal (tag Jaccard).
 *  `null` when either card isn't distilled, or the two ids are equal (nothing to compare). */
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
/** One theme's prevalence within a story-time month bucket (a `themeDrift` row). `themeName` is null when the
 *  cluster is below the name-worthiness floor (theme_clusters.name is nullable). */
export interface ThemeDriftTheme {
  readonly clusterIdx: number;
  readonly themeName: string | null;
  readonly count: number;
}

/** How the owner's themes shift over STORY time — per-month theme prevalence, bucket-ascending. `bucket` is a
 *  `YYYY-MM` string derived from the digest's `msgMidAt` (the position-median message time — PD-39). */
export interface ThemeDriftBucket {
  readonly bucket: string;
  readonly themes: ThemeDriftTheme[];
}

/** A character collected but NEVER played (no `chat_participants` character seat) — the catalog's dead weight
 *  / "try these" pile (the inverse of a forgotten gem). Name + avatar for display. */
export interface UnusedCharacter {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** The `backfillDigestStoryTime` summary — how many tier-0 assignment rows got a `msgMidAt` stamp (PD-39). */
export interface StoryTimeBackfillStats {
  readonly stamped: number;
}

// ── insights (economics-composed half: forgottenGems + modelRouting — PD-40/PD-22) ──────────────────────
/** A "forgotten gem" — a character with real INVESTED message volume that has gone quiet (a revisit
 *  candidate). `messageCount`/`lastActiveAt` are the SEMANTIC signals discovery ranks on (assistant-message
 *  volume + recency); `tokensOut`/`costUsd` are the ECONOMICS dimension, sourced from the injected `stats`
 *  op — NEVER a raw `messages` SUM in discovery (Knowledge-Cluster inv #5, the seam's Tier 3). */
export interface ForgottenGem {
  readonly characterId: CharacterId;
  readonly name: string;
  readonly avatarHash: string | null;
  readonly messageCount: number;
  readonly lastActiveAt: number;
  readonly tokensOut: number;
  readonly costUsd: number;
}

/** One (genre, model) routing row — for the owner's distilled GENRE (discovery semantics), which model was
 *  actually used and how it performed (the injected `stats` economics op). `avgGenTimeMs` is the mean
 *  wall-clock generation time (null when no generation carried both timestamps). Ordered by genre, then
 *  most-used model first — "for adventure RP I route to X". */
export interface ModelRoutingRow {
  readonly genre: string;
  readonly model: string;
  readonly provider: string | null;
  readonly generations: number;
  readonly tokensOut: number;
  readonly avgGenTimeMs: number | null;
  readonly costUsd: number;
}

// ── composed views (CONTENT-only server verbs — home + themeDetail) ─────────────────────────────────────
/** Corpus coverage — how much of the owner's library is indexed (NOT usage). `characters` = catalog size;
 *  `digests`/`segments` = memory-substrate depth. */
export interface CorpusCoverage {
  readonly characters: number;
  readonly digests: number;
  readonly segments: number;
}

/** The corpus HOME view — index coverage + the top scene/arc themes + the near-duplicate counts (the cleanup
 *  pile). CONTENT-only: usage cards (most-played / activity) are composed client-side from `stats`. */
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

/** One theme's DETAIL view — the cluster row + its story-time timeline (per-month assigned-digest counts) + the
 *  characters most present in it. `null` from the verb when no cluster matches (clusterIdx, level). */
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
/** One pair of cards sharing near-identical ART (reused/duplicate avatars) — a visual cleanup signal the
 *  text dedup can't see. `similarity` is the raw image↔image cosine (in-RAM, per the design). */
export interface ImageDuplicatePair {
  readonly characterIdA: CharacterId;
  readonly nameA: string;
  readonly characterIdB: CharacterId;
  readonly nameB: string;
  readonly similarity: number;
}

/** One art-style cluster — k-means over avatar vectors, labelled by what the cluster LOOKS like (dominant
 *  caption artStyle/mood), grounded by the members' distilled genre/tone. `model` = the embedding space. */
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

/** One character's portrait↔card cross-modal alignment (the PAIRED in-RAM cosine of the card-text vector and
 *  the avatar visual vector in the unified space). Low = the art doesn't represent the writing. */
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

/** The caption-derived visual facet distributions over the owner's current-avatar corpus — what the collection
 *  LOOKS like. Each list is value→count descending (reuses {@link FacetCount}). */
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
/** The `computeCharacterHubScores` summary. `rowsScored` is the total vector rows whose `hub_score` was
 *  written (reps + the content-collapsed members that inherit a rep's score); `groupsProcessed` is the
 *  number of (space) partitions the CSLS pass ran over. The digest/segment/image hub passes return a bare
 *  `rowsScored` number (their grouping/return is simpler — see the service interface). */
export interface HubStats {
  readonly rowsScored: number;
  readonly groupsProcessed: number;
}
