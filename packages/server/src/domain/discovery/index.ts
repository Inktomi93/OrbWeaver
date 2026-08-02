// domain/discovery — front door: the only legal external import; re-exports the slice's public surface.
// similarArt is NOT here by design — "more like this avatar" is retrieval, built as search.similarArt
// (2026-07-10; the dossier client queries it directly); discovery's image analytics stay retrieval-free.
//
// ONE TYPED ERROR, wired (2026-08-03, superseding the same day's zero-error state). The 08-03 deletion of
// `DiscoveryError` was correct — it was a class with no throw site — and the header that replaced it read the
// absence as law. The failure-path audit found one path where the absence was the DEFECT: the on-demand
// single-card distill (`suggestCharacterTags`) contained its own failure and answered 200 with `{distilled: 0,
// failed: 1}`, so the editor's "Suggest tags" button went quiet and told the user nothing. `contract/errors.ts`
// carries exactly the one error that path throws (`DistillFailedError`) and nothing else; its other refusal
// reuses the house `DomainNotFoundError` for the leak-free ownership collapse the cross-tenant sweep requires.
//
// Everything else in this domain still mints nothing, and that IS the law:
//   • a compute pass's engine/infra fault PROPAGATES unchanged (themes/generate, the workload runners);
//   • an LLM validation failure DEGRADES to a result that CARRIES the degrade as data — never a silent
//     substitution (`ComparisonNarrative.degraded`, `AskCardAnswer.degraded`, verbs/analyze.ts);
//   • the BATCH distill CONTAINS a per-card failure and reports it in `DistillStats.failed` (a sweep reports,
//     never aborts) — only the single-card narrow throws;
//   • an empty / degenerate corpus is a zero-count result, not a fault (the substrate is total on empty input).
// Growing this taxonomy further needs a convicted path with a throw site AND a surfaced client state — a class
// with neither is the exact lie that was deleted.

export type { DiscoveryContext } from "./context";
export { DistillFailedError } from "./contract/errors";
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
export type { DiscoveryService, DiscoveryWorkloadDeps } from "./contract/service";
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
