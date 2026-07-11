// domain/discovery/contract/params — the dispatch axes + the verb input shapes for the duplicate-character +
// theme/hub slice (the typed surface; §7.4 — every exported param shape homes HERE, not inline in a verb).
//
// §7.5 STRING-UNION DISPATCH: `ThemeLevel` (`scene | arc`) is the ONE importable union for the clustering
// level — derived from the {@link THEME_LEVELS} tuple, never inline re-spelled across `themes` / the
// `theme_clusters.level` column / `digest_theme_assignments`. (The db `theme_clusters.level` column is plain
// TEXT — db may not import this server-tier home — and the domain validates against this tuple, schema/
// discovery.ts header.)

import type { DuplicateRelation } from "@orb/contracts/discovery";
import type { CharacterId, UserId } from "@orb/kit/ids";

// ── ThemeLevel (the clustering-level dispatch axis) ───────────────────────────
/** `scene` = the tier-0 single-block digests; `arc` = the tier-1+ cross-block syntheses. The ONE home for
 *  the level axis (db column, reads, and compute all derive from this tuple — no inline re-spell). */
export const THEME_LEVELS = ["scene", "arc"] as const;
/** The clustering-level union — derived from {@link THEME_LEVELS} (§7.5 no-inline-union-redecl). */
export type ThemeLevel = (typeof THEME_LEVELS)[number];

// ── compute-pass option bags (workload-driven; all fields optional with built-in defaults) ────────────
/** Options for the `computeDuplicatePairs` recompute. `threshold` is the raw-cosine floor a pair must clear
 *  to be recorded (default {@link DEFAULT_DUP_THRESHOLD}); the recorded `cslsScore` is the hub-adjusted rank
 *  key, but the THRESHOLD gates on raw cosine (a hub-deflated near-dup must still be a near-dup). */
export interface ComputeDuplicatesOptions {
  readonly threshold?: number;
  /** Scope the recompute to ONE owner (the workloads SINGULAR mode — MY near-dups); omitted/null = every
   *  owner (the BULK dev pass). Singular reads only that owner's card vectors + replaces only that owner's
   *  pairs (never touches another owner's rows). */
  readonly ownerId?: UserId | null;
}

/** Options for the `computeThemes` recompute. `k` forces the cluster count (else a √(n/2) heuristic per
 *  (owner, level, space)); `seed` pins the k-means++ seeding PRNG (determinism — no ambient randomness). */
export interface ComputeThemesOptions {
  readonly k?: number;
  readonly seed?: number;
  /** Scope to ONE owner (SINGULAR — MY themes); omitted/null = every owner (BULK). Singular reads only that
   *  owner's digests + replaces only that owner's theme clusters. */
  readonly ownerId?: UserId | null;
}

/** Options for the `compute*HubScores` passes. `k` overrides the CSLS neighbour count (default `CSLS_K`);
 *  `denseMax` overrides the dense-vs-streaming switch (default `HUBNESS_DENSE_MAX`) — primarily a test seam
 *  to force the streaming branch on a small fixture (the two paths are bit-for-bit identical). */
export interface ComputeHubScoresOptions {
  readonly k?: number;
  readonly denseMax?: number;
  /** csls is ALWAYS owner-scoped — it analyzes YOUR OWN library only, NEVER against another owner's vectors
   *  (owner ruling). `ownerId` set = ONE owner (SINGULAR); omitted/null = a per-owner FAN-OUT over every owner
   *  (BULK — the owner-local hubness computed separately per owner, never a cross-tenant whole-space read). */
  readonly ownerId?: UserId | null;
}

/** Options for the `distillCharacters` pass (PD-40 write-half). `characterId` narrows to ONE card — the
 *  on-demand `suggestCharacterTags` editor button; ABSENT = the whole-library batch (the `distill-characters`
 *  workload). `ownerId` is the on-demand owner-scope belt (a foreign/missing character yields no work — never
 *  a cross-owner write). `signal` forwards the workload run's cancellation. */
export interface DistillCharactersOptions {
  readonly characterId?: CharacterId;
  readonly ownerId?: UserId;
  readonly signal?: AbortSignal | undefined;
}

/** Options for the `computeChatDuplicatePairs` recompute (the chat near-dup arm). `threshold` is the Jaccard
 *  floor a chat pair must clear (default {@link DEFAULT_CHAT_JACCARD}); `ownerId` scopes to ONE owner
 *  (SINGULAR — MY near-dup chats) else every owner (BULK). */
export interface ComputeChatDuplicatesOptions {
  readonly threshold?: number;
  readonly ownerId?: UserId | null;
}

// ── read option bags ──────────────────────────────────────────────────────────
/** Options for the owner-scoped `duplicateCharacters` read. `limit` caps the returned pairs (CSLS-ranked,
 *  highest first); `minScore` is an optional CSLS-score floor on the returned rows. */
export interface DuplicateCharactersOptions {
  readonly limit?: number;
  readonly minScore?: number;
}

/** Options for the owner-scoped `duplicateChats` read. `limit` caps the returned pairs (similarity-ranked,
 *  highest first); `minScore` is an optional Jaccard floor; `relation` narrows to only `forked` or only
 *  `duplicate` pairs (omitted = both). */
export interface DuplicateChatsOptions {
  readonly limit?: number;
  readonly minScore?: number;
  readonly relation?: DuplicateRelation;
}

// ── BrowseSort (the browse ordering dispatch axis) ────────────────────────────
/** `recent` = collected-date descending (`characters.createdAt`); `name` = card name ascending. The ONE home
 *  for the browse sort axis (§7.5 no-inline-union-redecl — `browseCharacters` derives from this tuple, never
 *  an inline re-spell). NOTE: discovery browse is CONTENT-only — an engagement/"most-played" sort is a stats
 *  concern (Knowledge-Cluster fence: discovery = semantics, stats = economics), composed client-side. */
export const BROWSE_SORTS = ["recent", "name"] as const;
/** The browse-sort union — derived from {@link BROWSE_SORTS}. */
export type BrowseSort = (typeof BROWSE_SORTS)[number];

/** The filter/sort/page bag for the owner-scoped `browseCharacters` read. All fields optional; an absent
 *  filter returns the owner's whole distilled corpus (capped at the default page). `genre`/`tone` are exact
 *  facet matches; `tag` is a case-insensitive exact tag membership; `q` is a case-insensitive substring over
 *  name / elevator-pitch / tags. `ownerId` is NEVER here — it is the resolved principal (audit #1). */
export interface BrowseFilter {
  readonly genre?: string;
  readonly tone?: string;
  readonly tag?: string;
  readonly q?: string;
  readonly sort?: BrowseSort;
  readonly limit?: number;
}

/** Options for the owner-scoped `archetypes` read. `k` forces the cluster count per embedding space (else the
 *  default); a space with fewer than `k + 1` collapsed cards yields no archetypes for that space. */
export interface ArchetypesOptions {
  readonly k?: number;
}

/** Options for the owner-scoped `similarityGraph` read. `minSimilarity` is the raw card-cosine floor a pair
 *  must clear to be an edge (default 0.65); `maxNodes` caps the graph to the highest-degree characters (the
 *  dense core, default 120). */
export interface SimilarityGraphOptions {
  readonly minSimilarity?: number;
  readonly maxNodes?: number;
}

// ── ImageFacetKey (the caption-facet dispatch axis — §7.5 gold standard) ───────
/** The caption facets a `charactersByImageFacet` drill can pivot on. The ONE home for the axis — the verb's
 *  `SCALAR_FACET_PATHS` Record + `isListFacet` guard derive from THIS tuple, so a new facet without an
 *  allowlisted json path fails `tsc` (the json path is allowlisted, NEVER caller-derived). `tag`/`exposedPart`
 *  are the LIST facets (a `json_each` membership test); the rest are scalar (a `json_extract` equality). */
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
/** The caption-facet key union — derived from {@link IMAGE_FACET_KEYS} (§7.5 no-inline-union-redecl). */
export type ImageFacetKey = (typeof IMAGE_FACET_KEYS)[number];

// ── cooccurrence (keyword×keyword co-occurrence within a tier-0 digest's keywords[]) ────────────────────
/** Options for the `computeCooccurrence` recompute. `maxPairs` keeps the top-N pairs per owner by count (the
 *  count-1 long tail is noise); `hubFraction` drops a keyword present in more than this fraction of an owner's
 *  digests (a hub token — mirrors CSLS); `ownerId` scopes to ONE owner (SINGULAR) else every owner (BULK);
 *  `signal`
 *  forwards the workload run's cancellation (checked per owner — each owner's write is its own atomic batch). */
export interface ComputeCooccurrenceOptions {
  readonly maxPairs?: number;
  readonly hubFraction?: number;
  readonly ownerId?: UserId | null;
  readonly signal?: AbortSignal | undefined;
}

/** Options for the owner-scoped `topKeywords` read. `limit` caps the returned keywords (count-descending);
 *  `minCount` is the minimum summed count a keyword must clear (the long tail of one-offs is dropped). */
export interface TopKeywordsOptions {
  readonly limit?: number;
  readonly minCount?: number;
}
