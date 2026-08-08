// domain/character — FRONT DOOR: the only legal external import; re-exports the public surface. Cross-
// boundary wire types/schemas live in `@orb/contracts/character` and are NOT re-exported here.

export type { CharacterContext } from "./context.ts";
export type { CharacterAvatarLink, CharacterAvatarLinkContext, LinkCharacterAvatars } from "./contract/avatar-link.ts";
export {
  AssetNotFoundError,
  CharacterNotFoundError,
  CharacterOperationError,
} from "./contract/errors.ts";
export type { CharacterHandoffCopyContext, CopyAvatarToOwner, CopyHandoffCards, HandoffCardCopy } from "./contract/handoff-copy.ts";
export { handoffProvenance } from "./contract/handoff-copy.ts";
export type {
  BulkAddCardTagParams,
  BulkArchiveParams,
  BulkRemoveCardTagParams,
  BulkRemoveParams,
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
  RemoveCharacterParams,
  RestoreParams,
  RewriteGreetingParams,
  SnapshotParams,
  UpdateCharacterParams,
} from "./contract/params.ts";
// The two refinery-consumed ops (R1) — factories here, types in contract/refinery-ops.ts, wired at compose.
export type { LoadOwnedCardOp, RefinerySignalsPatch, StampRefinerySignalsOp } from "./contract/refinery-ops.ts";
export type {
  CharacterRef,
  GeneratedGreeting,
  ListCharactersResult,
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
export { createCopyHandoffCards } from "./persistence/handoff-copy-write.ts";
export { createLoadOwnedCard, createStampRefinerySignals } from "./persistence/refinery-ops.ts";
export type { DefaultCharacterSeeder, DefaultCharacterSeederDeps, SeededCardContent } from "./seeder/index.ts";
export {
  CARD_PACK_VERSION,
  createDefaultCharacterSeeder,
  DEFAULT_CHARACTER_CARDS,
  matchesPriorPack,
  PRIOR_PACK_CONTENT,
  WELCOME_ASSISTANT_HANDLE,
} from "./seeder/index.ts";
export { createCharacterService } from "./service.ts";
