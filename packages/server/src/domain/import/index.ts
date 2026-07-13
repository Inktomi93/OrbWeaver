// domain/import — FRONT DOOR: the only legal external import; re-exports the public surface.

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
