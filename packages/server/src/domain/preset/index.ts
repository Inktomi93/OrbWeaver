// FRONT DOOR: the only legal external import. Cross-boundary shapes the views carry (PromptConfig,
// UserIntent, guided-action) are never re-exported here — callers import them from @orb/contracts/preset.

export type { LoadOptionalPreset } from "./contract/optional-read.ts";

export type {
  ExportPresets,
  ImportPreset,
} from "./contract/portability.ts";
export type {
  PresetAssemblyContext as PresetContext,
  PresetService,
} from "./contract/service.ts";
export { createCopyPresetToUser } from "./persistence/handoff-copy-write.ts";
// A boot verb that reads or writes rows of every owner takes `BootDatabaseHandle`, which only boot mints (D335).
export { migrateProseSlotVocab } from "./persistence/migrate-prose-slot-vocab.ts";
// The system default writes only the ownerless shared row, so it keeps the plain handle (D335).
export { ensureSystemDefaultPreset } from "./seed.ts";
export { createPresetService } from "./service.ts";
export { createLoadOptionalPreset } from "./substrate/optional-read.ts";
export { createExport as createExportPresets } from "./verbs/export.ts";
export { createImport as createImportPresets } from "./verbs/import.ts";
export { createReadOptionalPresetConfig } from "./verbs/optional-config.ts";
export { createPresetReadable } from "./verbs/readable.ts";
// The backward-bindings rule `PresetContext.resolvePresetUsage` runs; compose wires its three foreign inputs.
export { createResolvePresetUsage } from "./verbs/resolve-preset-usage.ts";
export { buildSideGenParams } from "./verbs/side-gen-params.ts";
