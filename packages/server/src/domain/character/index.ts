// domain/character — FRONT DOOR: the only legal external import; re-exports the public surface. Cross-
// boundary wire types/schemas live in `@orb/contracts/character` (the client + tRPC validate the SAME zod
// schema) — the transport imports those from `@orb/contracts` directly, so they are NOT re-exported here
// (the persona precedent). Chat/roster/memory receive the injected `getCard`/`mintSyntheticGroupCharacter`/
// `findSyntheticGroupCharacter` ops; the entry root builds the `CharacterContext` (it needs the port types
// `ReapAssetsOp`/`AttachCardTagOp` + the `DomainEvent` emit) and wires `createCharacterService`.
//
// FLAG[PD-32]: the `seeder/` subsystem (createDefaultCharacterSeeder / WELCOME_ASSISTANT_HANDLE /
//   DEFAULT_CHARACTER_CARDS — character.md §"Public surface") is a separable slice, not built here; its
//   exports will join this front door when that slice lands.

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
// Factory.
export { createCharacterService } from "./service";
