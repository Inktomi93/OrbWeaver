// domain/discovery/contract/results — the verb output shapes for discovery's read/compute surface.

/** The `computeDuplicatePairs` recompute summary (a workload-runner log line). */
export interface DuplicateComputeStats {
  readonly ownersProcessed: number;
  /** Card VECTORS read — the pass's input-plane census, written by the index pass. Zero on BOTH arms is the
   *  `find-duplicates` refusal signal; zero pairs off a non-zero scan is a real answer (issue #561). */
  readonly charactersScanned: number;
  readonly pairsWritten: number;
}

/** The `computeChatDuplicatePairs` recompute summary. */
export interface DuplicateChatComputeStats {
  readonly ownersProcessed: number;
  /** Chats with segment content-hashes — this arm's input-plane census, also written by the index pass. The
   *  other half of the `find-duplicates` refusal signal (issue #561). */
  readonly chatsScanned: number;
  readonly pairsWritten: number;
}

// ── themes ────────────────────────────────────────────────────────────────────

/** The `computeThemes` recompute summary. */
export interface ThemeComputeStats {
  readonly ownersProcessed: number;
  readonly clustersWritten: number;
  readonly digestsAssigned: number;
  /** Memory digests the pass READ, group rooms included. `0` is the pass's refusal signal — the caller turns
   *  it into a stated "no digests" result rather than a 0-written success, and the pass itself skips the
   *  atomic replace so nothing existing is destroyed (issue #166). */
  readonly digestsRead: number;
  /** Of those, the SOLO digests — the pass's ACTUAL input plane (group-room digests belong to the synthetic
   *  group character and are excluded before k-means). `0` with `digestsRead > 0` is its own refusal, and a
   *  DIFFERENT one: the backfill has already run, so the fix is not to run it again (issue #558). */
  readonly soloDigestsRead: number;
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

/** The `computeCooccurrence` recompute summary. */
export interface CooccurrenceStats {
  readonly ownersProcessed: number;
  /** Tier-0 memory digests the pass READ, group rooms included — its input plane, and the same one
   *  `compute-themes` reads. `0` is the refusal signal the caller turns into a stated "no digests" result
   *  instead of a 0-written success (issue #558; the honest-accounting family of #166). */
  readonly digestsRead: number;
  /** Of those, the SOLO digests — the pass's ACTUAL input plane. A group-room digest is scoped to the
   *  synthetic group bucket, so crediting its keywords would attribute a whole room's vocabulary to a
   *  character who is not a character; it is dropped before the tally, exactly as `compute-themes` drops it
   *  before k-means. `0` with `digestsRead > 0` is its own refusal — the backfill HAS run (#1467). */
  readonly soloDigestsRead: number;
  readonly pairsWritten: number;
  readonly charKeywordsWritten: number;
  readonly hubTokensDropped: number;
}

/** The `backfillDigestStoryTime` summary — how many tier-0 assignment rows got a `msgMidAt` stamp. */
export interface StoryTimeBackfillStats {
  readonly stamped: number;
}

// ── hubness ─────────────────────────────────────────────────────────────────
/** The `computeCharacterHubScores` summary. */
export interface HubStats {
  /** Vectors scored — and therefore also the pass's INPUT-PLANE CENSUS: every vector it loads gets exactly
   *  one hub update, so `0` means the embedding table was empty, not that the maths found nothing. The `csls`
   *  contribution turns that zero into a stated "nothing indexed" result rather than a 0-written success
   *  (issue #561; the honest-accounting family of #166). */
  readonly rowsScored: number;
  readonly groupsProcessed: number;
}

export type {
  Archetype,
  ArchetypeMember,
  AskCardAnswer,
  BrowseCharacter,
  BrowseCharactersPage,
  CatalogStats,
  CharacterComparison,
  CharacterComparisonDeep,
  CharacterDossier,
  CharacterFacets,
  ComparedCharacter,
  ComparisonNarrative,
  CorpusPoint,
  DistillStats,
  DossierNeighbor,
  DuplicateCharacterPair,
  DuplicateChatPair,
  FacetCount,
  ForgottenGem,
  HomeView,
  ImageDuplicatePair,
  ImageFacetMember,
  ImageFacets,
  KeywordCount,
  ModelRoutingRow,
  PortraitAlignment,
  PortraitAlignmentReport,
  SimilarChat,
  SimilarityGraph,
  SimilarityGraphEdge,
  SimilarityGraphNode,
  SwipeHotspot,
  TagCount,
  TagPair,
  ThemeDetail,
  ThemeDriftBucket,
  ThemeDriftTheme,
  ThemeMember,
  ThemeRow,
  UnusedCharacter,
  VisualArchetype,
} from "@orb/contracts/discovery";
