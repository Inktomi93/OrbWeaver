// domain/character — FRONT DOOR: the only legal external import; re-exports the public surface. Cross-
// boundary wire types/schemas live in `@orb/contracts/character` and are NOT re-exported here.

export type { CharacterContext } from "./context";
export {
  AssetNotFoundError,
  CardEvolutionProposalNotFoundError,
  CharacterNotFoundError,
  CharacterOperationError,
} from "./contract/errors";
export type {
  AcceptCardEvolutionParams,
  BulkAddCardTagParams,
  BulkArchiveParams,
  BulkRemoveCardTagParams,
  BulkRemoveParams,
  CharacterImportProvenance,
  CharacterListCursor,
  CreateCharacterParams,
  DismissCardEvolutionParams,
  DuplicateCharacterParams,
  FindByHandleParams,
  FindByImportHashParams,
  FindGroupCharParams,
  GetCardParams,
  GetCharacterParams,
  ListCardEvolutionProposalsParams,
  ListCharactersParams,
  ListSnapshotsParams,
  MintGroupCharParams,
  ProposeCardEvolutionParams,
  RemoveCharacterParams,
  RestoreParams,
  SnapshotParams,
  UpdateCharacterParams,
} from "./contract/params";
export type {
  CharacterRef,
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
export type { CardEvolutionProposalView, CharacterDetail, CharacterSummary } from "./contract/views";
export type { DefaultCharacterSeeder, DefaultCharacterSeederDeps } from "./seeder";
export {
  createDefaultCharacterSeeder,
  DEFAULT_CHARACTER_CARDS,
  WELCOME_ASSISTANT_HANDLE,
} from "./seeder";
export { createCharacterService } from "./service";
