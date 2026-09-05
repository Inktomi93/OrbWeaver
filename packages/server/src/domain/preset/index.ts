// FRONT DOOR: the only legal external import. Cross-boundary shapes the views carry (PromptConfig,
// UserIntent, guided-action) are never re-exported here — callers import them from @orb/contracts/preset.

export { SYSTEM_DEFAULT_PRESET_ID } from "./constants.ts";
export type { PresetContext } from "./context.ts";
export type { PresetOpCode } from "./contract/errors.ts";
export { PRESET_OP_CODES, PresetNotFoundError, PresetOperationError } from "./contract/errors.ts";
export type { CopyPresetToUser, PresetHandoffCopyContext } from "./contract/handoff-copy.ts";
export type { PackagedPresetKey } from "./contract/packaged.ts";
export type {
  CreatePresetParams,
  GetPresetParams,
  ImportPresetFileParams,
  ListPresetsParams,
  ListPresetUsageParams,
  RemovePresetParams,
  ResetToDefaultParams,
  ResolveEffectiveParams,
  UpdatePresetParams,
} from "./contract/params.ts";
export type {
  ExportPresets,
  ImportPreset,
  PresetExportFile,
  PresetImportOutcome,
} from "./contract/portability.ts";
export type { PresetService, ResolveChatCapabilityOp, ResolvePresetUsageOp } from "./contract/service.ts";
export type {
  EffectiveKnob,
  EffectiveKnobReading,
  EffectivePreset,
  EffectiveProvenance,
  PresetDetail,
  PresetSummary,
  PresetUsageView,
  StaleKnob,
} from "./contract/views.ts";
export { EFFECTIVE_KNOBS, EFFECTIVE_PROVENANCES } from "./contract/views.ts";
export { createCopyPresetToUser } from "./persistence/handoff-copy-write.ts";
export { migrateProseSlotVocab } from "./persistence/migrate-prose-slot-vocab.ts";
export { ensurePackagedPresets, ensureSystemDefaultPreset } from "./seed.ts";
export { createPresetService } from "./service.ts";
export { createExport as createExportPresets } from "./verbs/export.ts";
export { createImport as createImportPresets } from "./verbs/import.ts";
