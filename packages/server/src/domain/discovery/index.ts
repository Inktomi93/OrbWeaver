// domain/discovery — FRONT DOOR: the only legal external import; re-exports the public surface of THIS slice
// (duplicate-character detection + theme/hub discovery). The fuller corpus surface (browse/distill/archetype/
// projection/similarity/catalog/analyze/swipes/insights/tag-suggest/image-analytics/cooccurrence/views + the
// chat near-dup arm) is DEFERRED to later discovery waves (contract/service.ts deferral ledger).

export { DiscoveryError } from "./contract/errors";
export type {
  ComputeDuplicatesOptions,
  ComputeHubScoresOptions,
  ComputeThemesOptions,
  DuplicateCharactersOptions,
  ThemeLevel,
} from "./contract/params";
export { THEME_LEVELS } from "./contract/params";
// Consumed via service-method-signature inference at the tRPC routers + tests, not direct imports —
// don't flag these as unused exports.
export type {
  DuplicateCharacterPair,
  DuplicateComputeStats,
  HubStats,
  ThemeComputeStats,
  ThemeRow,
} from "./contract/results";
export type {
  DiscoveryContext,
  DiscoveryService,
  DiscoveryServiceDeps,
} from "./contract/service";
// Driven directly by the transport/jobs runners, not via tRPC.
export { computeDuplicatePairs, DEFAULT_DUP_THRESHOLD } from "./duplicates/generate";
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
