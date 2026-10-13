// domain/import — FRONT DOOR: the only legal external import; re-exports the public surface.

export { cardContentHash } from "#primitives/serde/card";
export type { ImportContext } from "./context.ts";
export type { ImportContextWiring } from "./contract/build-context.ts";
export type { BundleImportDeps, BundleImportFileOutcome, BundleImportReport, StagedBundleImportDeps } from "./contract/bundle.ts";
export type { ImportCardBatch, ImportCardBatchDeps, ImportFile } from "./contract/cards.ts";
export type { ImportDriverDeps, ImportWorkloadDrivers } from "./contract/drivers.ts";
export type { ImportCardErrorCode, ProfileImportLimitErrorCode } from "./contract/errors.ts";
export { ImportCardError, ImportInfraFailureError, ProfileImportLimitError } from "./contract/errors.ts";
export type { CardIdentityHashes, FindCharacterByHash, ImportedCharacterMatch } from "./contract/identity.ts";
export type { ImportCardInput, ImportCharacterInput, RestoreCharacterBookInput } from "./contract/params.ts";
export type { OwnerImportDeps, PortableImportDeps, PortableImports } from "./contract/portable.ts";
export type { ProfileDirImportDeps } from "./contract/profile-directory.ts";
export type {
  ImportCharacterResult,
  ImportChatFileOutcome,
  ImportedCharacterRef,
  ImportGroupsResult,
  ImportPresetsResult,
  RestoreCharacterBookResult,
} from "./contract/results.ts";
export type {
  CreateImportedCharacter,
  FindCharacterByImportHash,
  // R6 — the compose seam threads the orb-native chat bundle's three optional re-link ops through this shape.
  ImportProfileDeps,
  ImportService,
  StoreImportAsset,
} from "./contract/service.ts";
export type {
  CollectedBackground,
  CollectedCard,
  CollectedChat,
  CollectedGroup,
  CollectedPersona,
  CollectedPreset,
  CollectedTheme,
  CollectedWorld,
  CollectResult,
  ImportAmbiguousSpeakerName,
  ImportChatFileInput,
  ImportChatsInput,
  ImportDryRunCensus,
  ImportFsPort,
  ImportGroupsInput,
  ImportPersonaInput,
  ImportPresetNote,
  ImportReport,
  ImportSeatedDisabledMember,
  ImportSkippedCard,
  ImportSkippedCardTag,
  ImportSkippedGroup,
  ImportSkippedGroupMember,
  ImportThemeNote,
  ImportUnresolvedPinnedPersona,
  ImportWorldNote,
  IncomingPersona,
  UploadedFile,
} from "./contract/views.ts";
export type { BackfillTokenUsage, ImportTokenUsageBackfillDeps, ImportWorkloadDeps, SettleImportMemory } from "./contract/workloads.ts";
export { collectBundlesFromDir } from "./loader/collect.ts";
export { runProfileDirectory } from "./loader/profile-directory.ts";
export { createImportWorkloadDrivers } from "./loader/workload-drivers.ts";
export { createImportService } from "./service.ts";
export { buildImportContext } from "./substrate/build-context.ts";
export { bundleImportMemoryChatIds, bundleImportNotes } from "./substrate/bundle-report.ts";
export { findImportedCharacter, importFileHash, parseCardJson, parseCardPng, parsedCardImportHash, parsedCardTextHash } from "./substrate/card.ts";
export { buildGroupChatInput } from "./substrate/chat-input.ts";
export { parseStGroupFile } from "./substrate/group.ts";
export { incomingPersonasOf } from "./substrate/persona-review.ts";
export {
  parseStPresetFile,
  parseStSettingsPreset,
  ST_ACTIVE_PRESET_NAME,
  ST_PRESET_DIR,
  ST_PRESET_SETTINGS_KEY,
  stPresetFromJson,
  stPresetName,
} from "./substrate/preset.ts";
export { formatImportReport } from "./substrate/report.ts";
export { DEFAULT_IMPORT_STAGING_DIR, stagedOwnerRoot } from "./substrate/staging.ts";
export { sniffTreeLayout } from "./substrate/tree-layout.ts";
export { createBackfillTokenUsage } from "./verbs/backfill-token-usage.ts";
export { importStagedArchive, runBundleImport } from "./verbs/import-bundle.ts";
export { importCardBatch } from "./verbs/import-card-batch.ts";
export { createPortableImports } from "./verbs/import-portable.ts";
export { createInstallerCharacterImport, serializeImportCard } from "./verbs/installer-character.ts";
export { createEnqueueImportIndex, createImportLibraryEmitter, createSettleImportMemory } from "./verbs/post-import.ts";
export { createImportWorkloadContributions } from "./workload-contributions.ts";
