// domain/import — FRONT DOOR: the only legal external import; re-exports the public surface.

export { cardContentHash } from "#kit/serde/card";
export type { ImportContext } from "./context";
export type { ImportCardErrorCode } from "./contract/errors";
export { ImportCardError } from "./contract/errors";
export type { ImportCardInput, ImportCharacterInput } from "./contract/params";
export type { ImportCharacterResult, ImportedCharacterRef } from "./contract/results";
export type {
  CreateImportedCharacter,
  FindCharacterByImportHash,
  ImportService,
  StoreImportAsset,
} from "./contract/service";
export type {
  CollectedCard,
  CollectedChat,
  CollectedPersona,
  CollectResult,
  ImportChatsInput,
  ImportFsPort,
  ImportPersonaInput,
} from "./contract/views";
export type { ImportWorkloadDeps } from "./contract/workloads";
export { collectBundlesFromDir } from "./loader/collect";
export { createImportService } from "./service";
export { importFileHash, parseCardJson, parseCardPng } from "./substrate/card";
export { createImportWorkloadContributions } from "./workload-contributions";
