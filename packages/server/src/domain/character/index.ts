// domain/character — FRONT DOOR: the only legal external import; re-exports the public surface. Cross-
// boundary wire types/schemas live in `@orb/contracts/character` and are NOT re-exported here.

export type { CharacterContext } from "./context.ts";
export type { CharacterAvatarLink, CharacterAvatarLinkContext, LinkCharacterAvatars } from "./contract/avatar-link.ts";
export {
  AssetNotFoundError,
  CHARACTER_HANDLE_CONFLICT,
  CharacterNotFoundError,
  CharacterOperationError,
} from "./contract/errors.ts";
export type { CharacterHandoffCopyContext, CopyAssetToOwner, CopyHandoffCards, HandoffCardCopy } from "./contract/handoff-copy.ts";
export { handoffProvenance } from "./contract/handoff-copy.ts";
export type {
  BulkAddCardTagParams,
  BulkArchiveParams,
  BulkRemoveCardTagParams,
  BulkRemoveParams,
  CardWriteBasis,
  CharacterImportProvenance,
  CharacterListCursor,
  CreateCharacterParams,
  DuplicateCharacterParams,
  FindByHandleParams,
  FindByImportHashParams,
  FindGroupCharParams,
  GenerateGreetingParams,
  GetCardParams,
  GetCharacterParams,
  ListCharactersParams,
  ListSnapshotsParams,
  MintGroupCharParams,
  PluginCardDataTarget,
  RemoveCharacterParams,
  RestoreParams,
  RewriteGreetingParams,
  SnapshotParams,
  UpdateCharacterParams,
} from "./contract/params.ts";
// The refinery-consumed ops (R1 + the R4 sweep enumeration) — factories here, types in
// contract/refinery-ops.ts, wired at compose.
export type {
  DeleteSnapshotOp,
  ListRefineryScoreTargetsOp,
  LoadOwnedCardOp,
  RefineryScoreTarget,
  RefinerySignalsPatch,
  StampRefinerySignalsOp,
} from "./contract/refinery-ops.ts";
export type {
  BackfillPluginProvenanceResult,
  CharacterRef,
  GeneratedGreeting,
  ListCharactersResult,
  PluginCardDataRead,
  SnapshotRef,
  SnapshotSummary,
} from "./contract/results.ts";
export type {
  AttachCardTagOp,
  CharacterService,
  DetachCardTagOp,
  ReapAssetsOp,
} from "./contract/service.ts";
export type { CharacterDetail, CharacterSummary } from "./contract/views.ts";
export { createLinkCharacterAvatars } from "./persistence/avatar-link-write.ts";
export { backfillPluginProvenance } from "./persistence/backfill-plugin-provenance.ts";
export { createCopyHandoffCards } from "./persistence/handoff-copy-write.ts";
export { migrateSeededCardBackgrounds } from "./persistence/migrate-seeded-backgrounds.ts";
export { readPluginCardData, writePluginCardData } from "./persistence/plugin-card-data.ts";
export { createDeleteSnapshot, createListRefineryScoreTargets, createLoadOwnedCard, createStampRefinerySignals } from "./persistence/refinery-ops.ts";
export type { DefaultCharacterSeeder, DefaultCharacterSeederDeps, SeededCardContent } from "./seeder/index.ts";
export { createDefaultCharacterSeeder, DEFAULT_CHARACTER_CARDS, matchesAuthoredContent, WELCOME_ASSISTANT_HANDLE } from "./seeder/index.ts";
export { createCharacterService } from "./service.ts";
