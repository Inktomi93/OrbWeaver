// domain/import — FRONT DOOR: the only legal external import; re-exports the public surface.

export { cardContentHash } from "#kit/serde/card";
export type { ImportContext } from "./context.ts";
export type { ImportCardErrorCode } from "./contract/errors.ts";
export { ImportCardError } from "./contract/errors.ts";
export type { ImportCardInput, ImportCharacterInput } from "./contract/params.ts";
export type { ImportCharacterResult, ImportChatFileOutcome, ImportedCharacterRef } from "./contract/results.ts";
export type {
  CreateImportedCharacter,
  FindCharacterByImportHash,
  // R6 — the compose seam threads the orb-native chat bundle's three optional re-link ops through this shape.
  ImportProfileDeps,
  ImportService,
  StoreImportAsset,
} from "./contract/service.ts";
export type {
  CollectedCard,
  CollectedChat,
  CollectedPersona,
  CollectResult,
  ImportChatFileInput,
  ImportChatsInput,
  ImportFsPort,
  ImportPersonaInput,
} from "./contract/views.ts";
export type { ImportWorkloadDeps } from "./contract/workloads.ts";
export { collectBundlesFromDir } from "./loader/collect.ts";
export { createImportService } from "./service.ts";
export { importFileHash, parseCardJson, parseCardPng } from "./substrate/card.ts";
export { createImportWorkloadContributions } from "./workload-contributions.ts";
