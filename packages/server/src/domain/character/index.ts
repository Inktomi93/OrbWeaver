// domain/character — FRONT DOOR: the only legal external import; re-exports the public surface. Cross-
// boundary wire types/schemas live in `@orb/contracts/character` and are NOT re-exported here.

export type { CharacterContext } from "./context";
export {
  AssetNotFoundError,
  CharacterNotFoundError,
  CharacterOperationError,
} from "./contract/errors";
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
} from "./contract/params";
export type {
  CharacterRef,
  GeneratedGreeting,
  ListCharactersResult,
  SnapshotRef,
  SnapshotSummary,
} from "./contract/results";
export type {
  AttachCardTagOp,
  CharacterService,
  DetachCardTagOp,
  ReapAssetsOp,
} from "./contract/service";
export type { CharacterDetail, CharacterSummary } from "./contract/views";
export type { DefaultCharacterSeeder, DefaultCharacterSeederDeps, SeededCardContent } from "./seeder";
export {
  CARD_PACK_VERSION,
  createDefaultCharacterSeeder,
  DEFAULT_CHARACTER_CARDS,
  matchesPriorPack,
  PRIOR_PACK_CONTENT,
  WELCOME_ASSISTANT_HANDLE,
} from "./seeder";
export { createCharacterService } from "./service";
