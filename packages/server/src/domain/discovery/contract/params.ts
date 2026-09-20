// domain/discovery/contract/params — the dispatch axes + verb input shapes for discovery's compute/read surface.

import type { BrowseCursor, BrowseSort, DuplicateRelation } from "@orb/contracts/discovery";
import type { ImageFacetMetaKey } from "@orb/contracts/embeddings";
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
  /** WHO FUNDS the cluster naming — the workload's acting user (`WorkloadRunContext.userId`). */
  readonly funderUserId: UserId;
}

/** Options for the `compute*HubScores` passes. `denseMax` forces the streaming branch on a small fixture. */
export interface ComputeHubScoresOptions {
  readonly k?: number;
  readonly denseMax?: number;
  /** csls is always owner-scoped — never against another owner's vectors. */
  readonly ownerId?: UserId | null;
}

/** Options for the `distillCharacters` pass. `characterId` narrows to one card; absent = whole-library batch. */
export type DistillCharactersOptions = DistillTargetNarrow & {
  /** WHO FUNDS the pass — the caller on the on-demand arm, the workload's acting user on the batch arm. */
  readonly funderUserId: UserId;
  readonly signal?: AbortSignal | undefined;
  /** Per-card position for the caller's progress surface (`done`, `total`). The PASS owns the denominator —
   *  the workload wrapper never reads the target list — so N-of-M can only originate here (issue #166). */
  readonly onProgress?: ((done: number, total: number) => void) | undefined;
};

/**
 * WHICH CARDS a distill pass targets — and the ONE place the `characterId`↔`ownerId` pairing is enforced
 * (#1414 seam 1). The narrow used to be two independent optionals, so `{characterId}` ALONE was well-typed:
 * `readCardDistillTargets` would then select any non-synthetic character in the box and the pass would commit
 * a `character_summaries` row + staged `pending` tag suggestions under THAT card's own owner. Every live
 * caller happened to pair them (the tRPC seam supplies `ctx.auth.userId`; the workload arm never sets
 * `characterId`), which is precisely the "safe because of who calls it" a two-arm union replaces with
 * physics: an on-demand narrow structurally cannot arrive without saying whose card it is.
 * ENFORCER: `tsc`, at this type and at `readCardDistillTargets`' signature.
 */
export type DistillTargetNarrow =
  | { readonly characterId: CharacterId; readonly ownerId: UserId }
  | { readonly characterId?: undefined; readonly ownerId?: UserId };

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
// The axis and its keyset live in `@orb/contracts/discovery` (moved 2026-08-19 with the A8 paging): the
// cursor is a WIRE shape discriminated on this union, so the two have to be spelled in one place, and that
// place is the one both ends can import. Re-exported here so the domain's own callers keep one front door.
export type { BrowseCursor, BrowseSort } from "@orb/contracts/discovery";

/** The filter/sort/page bag for the owner-scoped `browseCharacters` read. `ownerId` is never here — it is
 *  the resolved principal. */
export interface BrowseFilter {
  readonly genre?: string;
  readonly tone?: string;
  readonly tag?: string;
  readonly q?: string;
  readonly sort?: BrowseSort;
  readonly limit?: number;
  /** The keyset boundary of the PREVIOUS page. Its `sort` discriminant must match `sort` — a cursor minted
   *  under the other ordering is refused, never applied to the wrong keyset. */
  readonly cursor?: BrowseCursor;
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
/**
 * The VL breakdown facet a `charactersByImageFacet` drill pivots on, keyed by the STORED `caption_meta`
 * property it reads. The vocabulary itself is `@orb/contracts/embeddings` (the write side owns it, both
 * domains read it), and this is the ONE map between the stored key and the drill's public name — a
 * `Record` over `ImageFacetMetaKey`, so a facet added to the breakdown schema with no drill name here is a
 * tsc error rather than a silently un-drillable column (§5.5).
 *
 * The two SET facets take a singular drill name because the drill selects ONE value out of the set
 * (`tag: "cat ears"`), while the tally names the array it counts.
 */
export const IMAGE_FACET_DRILL_KEY = {
  artStyle: "artStyle",
  palette: "palette",
  mood: "mood",
  rating: "rating",
  shotType: "shotType",
  cameraAngle: "cameraAngle",
  gender: "gender",
  coverage: "coverage",
  bodyType: "bodyType",
  chestSize: "chestSize",
  skinTone: "skinTone",
  outfitType: "outfitType",
  clothingState: "clothingState",
  nudityLevel: "nudityLevel",
  exposedParts: "exposedPart",
  tags: "tag",
} as const satisfies Record<ImageFacetMetaKey, string>;

export type ImageFacetKey = (typeof IMAGE_FACET_DRILL_KEY)[ImageFacetMetaKey];

/** The drill names, for the transport enum. DERIVED — never re-spelled (that second list is exactly how the
 *  old twelve-key tuple drifted from the fourteen paths the reader used). */
export const IMAGE_FACET_KEYS: readonly ImageFacetKey[] = Object.values(IMAGE_FACET_DRILL_KEY);

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
