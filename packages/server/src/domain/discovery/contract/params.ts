// domain/discovery/contract/params — the dispatch axes + verb input shapes for discovery's compute/read surface.

import type { DuplicateRelation } from "@orb/contracts/discovery";
import type { CharacterId, UserId } from "@orb/kit/ids";

// ── ThemeLevel (the clustering-level dispatch axis) ───────────────────────────
/** `scene` = tier-0 single-block digests; `arc` = tier-1+ cross-block syntheses. */
export const THEME_LEVELS = ["scene", "arc"] as const;
export type ThemeLevel = (typeof THEME_LEVELS)[number];

// ── compute-pass option bags (workload-driven; all fields optional with built-in defaults) ────────────
/** Options for the `computeDuplicatePairs` recompute. `threshold` is the raw-cosine floor a pair must clear. */
export interface ComputeDuplicatesOptions {
  readonly threshold?: number;
  /** Scope to one owner (singular); omitted/null = every owner (bulk). */
  readonly ownerId?: UserId | null;
}

/** Options for the `computeThemes` recompute. `seed` pins the k-means++ seeding PRNG for determinism. */
export interface ComputeThemesOptions {
  readonly k?: number;
  readonly seed?: number;
  readonly ownerId?: UserId | null;
}

/** Options for the `compute*HubScores` passes. `denseMax` forces the streaming branch on a small fixture. */
export interface ComputeHubScoresOptions {
  readonly k?: number;
  readonly denseMax?: number;
  /** csls is always owner-scoped — never against another owner's vectors. */
  readonly ownerId?: UserId | null;
}

/** Options for the `distillCharacters` pass. `characterId` narrows to one card; absent = whole-library batch. */
export interface DistillCharactersOptions {
  readonly characterId?: CharacterId;
  readonly ownerId?: UserId;
  readonly signal?: AbortSignal | undefined;
}

/** Options for the `computeChatDuplicatePairs` recompute (the chat near-dup arm). */
export interface ComputeChatDuplicatesOptions {
  readonly threshold?: number;
  readonly ownerId?: UserId | null;
}

// ── read option bags ──────────────────────────────────────────────────────────
/** Options for the owner-scoped `duplicateCharacters` read, CSLS-ranked. */
export interface DuplicateCharactersOptions {
  readonly limit?: number;
  readonly minScore?: number;
}

/** Options for the owner-scoped `duplicateChats` read. `relation` narrows to `forked` or `duplicate`. */
export interface DuplicateChatsOptions {
  readonly limit?: number;
  readonly minScore?: number;
  readonly relation?: DuplicateRelation;
}

// ── BrowseSort (the browse ordering dispatch axis) ────────────────────────────
/** `recent` = collected-date descending; `name` = card name ascending. Discovery browse is content-only. */
export const BROWSE_SORTS = ["recent", "name"] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];

/** The filter/sort/page bag for the owner-scoped `browseCharacters` read. `ownerId` is never here — it is
 *  the resolved principal. */
export interface BrowseFilter {
  readonly genre?: string;
  readonly tone?: string;
  readonly tag?: string;
  readonly q?: string;
  readonly sort?: BrowseSort;
  readonly limit?: number;
}

/** Options for the owner-scoped `archetypes` read. `k` forces the cluster count per embedding space. */
export interface ArchetypesOptions {
  readonly k?: number;
}

/** Options for the owner-scoped `similarityGraph` read. `maxNodes` caps the graph to highest-degree characters. */
export interface SimilarityGraphOptions {
  readonly minSimilarity?: number;
  readonly maxNodes?: number;
}

// ── ImageFacetKey (the caption-facet dispatch axis) ───────
/** The caption facets a `charactersByImageFacet` drill can pivot on. `tag`/`exposedPart` are list facets
 *  (json_each membership); the rest are scalar (json_extract equality). */
export const IMAGE_FACET_KEYS = [
  "artStyle",
  "rating",
  "shotType",
  "cameraAngle",
  "gender",
  "coverage",
  "bodyType",
  "chestSize",
  "skinTone",
  "outfitType",
  "clothingState",
  "nudityLevel",
  "tag",
  "exposedPart",
] as const;
export type ImageFacetKey = (typeof IMAGE_FACET_KEYS)[number];

// ── cooccurrence (keyword×keyword co-occurrence within a tier-0 digest's keywords[]) ────────────────────
/** Options for the `computeCooccurrence` recompute. `hubFraction` drops a keyword present in more than this
 *  fraction of an owner's digests (a hub token). */
export interface ComputeCooccurrenceOptions {
  readonly maxPairs?: number;
  readonly hubFraction?: number;
  readonly ownerId?: UserId | null;
  readonly signal?: AbortSignal | undefined;
}

/** Options for the owner-scoped `topKeywords` read, count-descending. */
export interface TopKeywordsOptions {
  readonly limit?: number;
  readonly minCount?: number;
}
