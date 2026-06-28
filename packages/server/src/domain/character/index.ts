// domain/character — FRONT DOOR: the only legal external import; re-exports the public surface. Cross-
// boundary wire types/schemas live in `@orb/contracts/character` (the client + tRPC validate the SAME zod
// schema) — the transport imports those from `@orb/contracts` directly, so they are NOT re-exported here
// (the persona precedent). Chat/roster/memory receive the injected `getCard`/`mintSyntheticGroupCharacter`/
// `findSyntheticGroupCharacter` ops; the entry root builds the `CharacterContext` (it needs the port types
// `ReapAssetsOp`/`AttachCardTagOp` + the `DomainEvent` emit) and wires `createCharacterService`. The
// default-card `seeder/` subsystem (PD-32) is re-exported below — entry constructs the ONE instance over the
// built `CharacterService` + the injected settings latch ops (boot + the app first-request hook share it).

// Errors (mapped to tRPC codes at the transport boundary).
export { CharacterNotFoundError, CharacterOperationError } from "./contract/errors";
// Verb param types (the transport names them at its boundary).
export type {
  BulkAddCardTagParams,
  BulkArchiveParams,
  BulkRemoveParams,
  CharacterImportProvenance,
  CreateCharacterParams,
  DuplicateCharacterParams,
  FindByHandleParams,
  FindByImportHashParams,
  FindGroupCharParams,
  GetCardParams,
  GetCharacterParams,
  ListCharactersParams,
  ListSnapshotsParams,
  MintGroupCharParams,
  RemoveCharacterParams,
  RestoreParams,
  SnapshotParams,
  UpdateCharacterParams,
} from "./contract/params";
// Result shapes (CharacterRef is what the injected synthetic mint/find ops return).
export type { CharacterRef, SnapshotRef, SnapshotSummary } from "./contract/results";
// Service + DI-bundle + injected-op types (the entry root assembles the context).
export type {
  AttachCardTagOp,
  CharacterContext,
  CharacterService,
  ReapAssetsOp,
} from "./contract/service";
// View types (what the client receives).
export type { CharacterDetail, CharacterSummary } from "./contract/views";
// Default-card seeder subsystem (entry constructs the ONE instance — boot + the app first-request hook).
export type { DefaultCharacterSeeder, DefaultCharacterSeederDeps } from "./seeder";
export {
  createDefaultCharacterSeeder,
  DEFAULT_CHARACTER_CARDS,
  WELCOME_ASSISTANT_HANDLE,
} from "./seeder";
// Factory.
export { createCharacterService } from "./service";
