// domain/import — FRONT DOOR: the only legal external import; re-exports the public surface.
//   • createImportService (the factory the entry root wires over the assembled ImportContext)
//   • the ImportService contract + the injected-op TYPES (the root needs them to wire the bundle)
//   • the card-import input/result types (the bulk driver at entry/ + integration tests consume them)
//   • the pure parsers + the card content hash (driven by the entry bulk driver + tests)
//   • ImportCardError (so the transport + tests discriminate the card-read/validate failure)
//
// SCOPE (4c W3): the SillyTavern character-card path. The chats/personas parsers + the profile collector
// (`proposed/import-st-profile-waves.md`, PD-77) land with their waves.

// The card content hash is single-homed in the serde kit (PD-33); the front door re-surfaces it so the
// bulk driver + tests reach the import public surface in one place.
export { cardContentHash } from "#kit/serde/card";
export type { ImportCardErrorCode } from "./contract/errors";
export { ImportCardError } from "./contract/errors";
export type { ImportCardInput, ImportCharacterInput } from "./contract/params";
export type { ImportCharacterResult, ImportedCharacterRef } from "./contract/results";
export type {
  CreateImportedCharacter,
  FindCharacterByImportHash,
  ImportContext,
  ImportService,
  StoreImportAsset,
} from "./contract/service";
export { createImportService } from "./service";
export { parseCardJson, parseCardPng } from "./substrate/card";
