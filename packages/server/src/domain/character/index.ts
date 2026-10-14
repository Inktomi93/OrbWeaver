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
export type { GreetingCompletionDeps, GreetingTemplateDeps } from "./contract/greeting-ops.ts";
export type { CharacterHandoffCopyContext, CopyAssetToOwner, CopyHandoffCards, HandoffCardCopy } from "./contract/handoff-copy.ts";
export { handoffProvenance } from "./contract/handoff-copy.ts";
export type { ImportCharacterPort } from "./contract/import-ops.ts";
export type {
  AttachImportedArtParams,
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
  FindByNameParams,
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
  CountRefineryScoreTargetsOp,
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
export { createLoadCharacterEmbeddingOwner } from "./persistence/embedding-owner.ts";
export { createCopyHandoffCards } from "./persistence/handoff-copy-write.ts";
export { migrateSeededCardBackgrounds } from "./persistence/migrate-seeded-backgrounds.ts";
export { createCharacterOwned, createOwnedCharacterIds } from "./persistence/ownership-ops.ts";
export { readPluginCardData, writePluginCardData } from "./persistence/plugin-card-data.ts";
export {
  createCountRefineryScoreTargets,
  createDeleteSnapshot,
  createListRefineryScoreTargets,
  createLoadOwnedCard,
  createStampRefinerySignals,
} from "./persistence/refinery-ops.ts";
export { createLoadSeatCards } from "./persistence/seat-cards.ts";
export type { DefaultCharacterSeeder, DefaultCharacterSeederDeps, SeededCardContent } from "./seeder/index.ts";
export { createDefaultCharacterSeeder, DEFAULT_CHARACTER_CARDS, matchesAuthoredContent, WELCOME_ASSISTANT_HANDLE } from "./seeder/index.ts";
export { createCharacterService } from "./service.ts";
export { cardTokenSize } from "./substrate/card-tokens.ts";
export { buildCardEmbedText } from "./substrate/embed-text.ts";
// rpg promotion recovers from a handle-uniqueness refusal through this, injected at the composition root.
export { isCharacterHandleConflict } from "./substrate/handle-conflict.ts";
export { createEmbeddableCardText } from "./verbs/embeddable-card-text.ts";
export { createGalleryCharacterOps } from "./verbs/gallery-character-ops.ts";
export { createGreetingCompletion, createGreetingTemplate } from "./verbs/greeting-ops.ts";
export { createCharacterImportOps } from "./verbs/import-ops.ts";
export { createCharacterRoomProjections } from "./verbs/room-projections.ts";
export { createFindSeedCharacter } from "./verbs/seed-reader.ts";
export { createCharacterSeedStep } from "./verbs/seed-step.ts";
