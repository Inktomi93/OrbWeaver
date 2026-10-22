// domain/import — FRONT DOOR: the only legal external import; re-exports the public surface.

export type { ImportFile } from "./contract/cards.ts";
export type { UploadedFile } from "./contract/collection.ts";

export { ImportCardError, ImportInfraFailureError, ProfileImportLimitError } from "./contract/errors.ts";

export type { ProfileDirImportDeps } from "./contract/profile-directory.ts";
export type {
  ImportReport,
  RestoreCharacterBookResult,
} from "./contract/results.ts";
export type {
  // R6 — the compose seam threads the orb-native chat bundle's three optional re-link ops through this shape.
  ImportProfileDeps,
} from "./contract/service.ts";
export type { ImportWorkloadDeps, SettleImportMemory } from "./contract/workloads.ts";
export { collectBundlesFromDir } from "./loader/collect.ts";
export { importStagedArchive, runBundleImport } from "./loader/import-bundle.ts";
export { importCardBatch } from "./loader/import-card-batch.ts";
export { runProfileDirectory } from "./loader/profile-directory.ts";
export { createImportWorkloadDrivers, createRefreshImportPlannerStats } from "./loader/workload-drivers.ts";
export { createImportService } from "./service.ts";
export { buildImportContext } from "./substrate/build-context.ts";
export { bundleImportMemoryChatIds, bundleImportNotes } from "./substrate/bundle-report.ts";
export { findImportedCharacter } from "./substrate/card.ts";
export { incomingPersonasOf } from "./substrate/persona-review.ts";
export { formatImportReport } from "./substrate/report.ts";
export { DEFAULT_IMPORT_STAGING_DIR, stagedOwnerRoot } from "./substrate/staging.ts";
export { createEnqueueImportIndex } from "./verbs/enqueue-import-index.ts";
export { createImportLibraryEmitter } from "./verbs/import-library-emitter.ts";
export { createInstallerCharacterImport, serializeImportCard } from "./verbs/installer-character.ts";
export { createPortableImports } from "./verbs/portable-imports.ts";
export { createSettleImportMemory } from "./verbs/settle-import-memory.ts";
export { createImportWorkloadContributions } from "./workload-contributions.ts";
