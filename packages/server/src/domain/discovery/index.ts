// domain/discovery — front door: the only legal external import; re-exports the slice's public surface.
// similarArt is NOT here by design — "more like this avatar" is retrieval, built as search.similarArt
// (2026-07-10; the dossier client queries it directly); discovery's image analytics stay retrieval-free.

export type { DiscoveryContext } from "./context";
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
// Consumed via service-method-signature inference at the tRPC routers + tests, not direct imports.
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
export type { DiscoveryService, DiscoveryServiceDeps, DiscoveryWorkloadDeps } from "./contract/service";
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
export { createDiscoveryWorkloadContributions } from "./workload-contributions";
