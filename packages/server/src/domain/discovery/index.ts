// domain/discovery — FRONT DOOR: the only legal external import; re-exports the public surface of the slice —
// duplicate character + chat near-dup detection, theme/hub discovery, distill (write + browse/facets reads),
// archetypes + projection, cooccurrence, insights (themeDrift/unusedCharacters), catalog/compare, composed
// views (home/themeDetail), image-analytics (duplicates/archetypes/portraitAlignment/facets), and the
// economics-composed insights (forgottenGems/modelRouting — the stats↔discovery seam Tier 3), and the
// DISCOVERY-NATIVE similarity wave (similarityGraph + similarChats — all-pairs / segment-centroid in-RAM
// cosine, ZERO search). Still DEFERRED (contract/service.ts ledger — blocked on other surfaces): similarArt +
// characterDossier.similar (search), characterDossier.portrait (image cross-modal), analyze/swipes (the
// semantic messages/message_variants read).

export { DiscoveryError } from "./contract/errors";
export type {
  ArchetypesOptions,
  BrowseFilter,
  BrowseSort,
  ComputeChatDuplicatesOptions,
  ComputeCooccurrenceOptions,
  ComputeDuplicatesOptions,
  ComputeHubScoresOptions,
  ComputeThemesOptions,
  DuplicateCharactersOptions,
  DuplicateChatsOptions,
  ImageFacetKey,
  SimilarityGraphOptions,
  ThemeLevel,
  TopKeywordsOptions,
} from "./contract/params";
export { BROWSE_SORTS, IMAGE_FACET_KEYS, THEME_LEVELS } from "./contract/params";
// Consumed via service-method-signature inference at the tRPC routers + tests, not direct imports —
// don't flag these as unused exports.
export type {
  Archetype,
  ArchetypeMember,
  BrowseCharacter,
  CatalogStats,
  CharacterComparison,
  CharacterFacets,
  ComparedCharacter,
  CooccurrenceStats,
  CorpusPoint,
  DuplicateCharacterPair,
  DuplicateChatComputeStats,
  DuplicateChatPair,
  DuplicateComputeStats,
  FacetCount,
  ForgottenGem,
  HomeView,
  HubStats,
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
  StoryTimeBackfillStats,
  TagCount,
  TagPair,
  ThemeComputeStats,
  ThemeDetail,
  ThemeDriftBucket,
  ThemeDriftTheme,
  ThemeMember,
  ThemeRow,
  UnusedCharacter,
  VisualArchetype,
} from "./contract/results";
export type {
  DiscoveryContext,
  DiscoveryService,
  DiscoveryServiceDeps,
} from "./contract/service";
// Driven directly by the transport/jobs runners, not via tRPC.
export {
  computeCooccurrence,
  DEFAULT_HUB_FRACTION,
  DEFAULT_MAX_PAIRS,
} from "./cooccurrence/generate";
export {
  computeChatDuplicatePairs,
  computeDuplicatePairs,
  DEFAULT_CHAT_JACCARD,
  DEFAULT_DUP_THRESHOLD,
} from "./duplicates/generate";
export { createDiscoveryService } from "./service";
export { CSLS_K, HUBNESS_DENSE_MAX } from "./substrate/hub-math";
export { computeThemes } from "./themes/generate";
export {
  computeCharacterHubScores,
  computeDigestHubScores,
  computeImageHubScores,
  computeSegmentHubScores,
} from "./verbs/compute-hub-scores";

// (No delete-time sweep export — duplicate_character_pairs uses real FK + CASCADE; stale pairs die with
// their character, D24. The chat near-dup arm + the `relation` axis are deferred — see service.ts.)
