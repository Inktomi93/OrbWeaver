// FRONT DOOR: the only legal external import. Cross-boundary shapes the views carry (PromptConfig,
// UserIntent, guided-action) are never re-exported here — callers import them from @orb/contracts/preset.

export { SYSTEM_DEFAULT_PRESET_ID } from "./constants";
export type { PresetContext } from "./context";
export type { PresetOpCode } from "./contract/errors";
export { PRESET_OP_CODES, PresetNotFoundError, PresetOperationError } from "./contract/errors";
export type { PackagedPresetKey } from "./contract/packaged";
export type {
  CreatePresetParams,
  GetPresetParams,
  ImportPresetFileParams,
  ListPresetsParams,
  RemovePresetParams,
  ResetToDefaultParams,
  ResolveEffectiveParams,
  UpdatePresetParams,
} from "./contract/params";
export type {
  ExportPresets,
  ImportPreset,
  PresetExportFile,
  PresetImportOutcome,
} from "./contract/portability";
export type { PresetService, ResolveChatCapabilityOp } from "./contract/service";
export type { EffectiveKnob, EffectiveKnobReading, EffectivePreset, EffectiveProvenance, PresetDetail, PresetSummary, StaleKnob } from "./contract/views";
export { EFFECTIVE_KNOBS, EFFECTIVE_PROVENANCES } from "./contract/views";
export { ensurePackagedPresets, ensureSystemDefaultPreset } from "./seed";
export { createPresetService } from "./service";
export { createExport as createExportPresets } from "./verbs/export";
export { createImport as createImportPresets } from "./verbs/import";
