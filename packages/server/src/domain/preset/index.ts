// FRONT DOOR: the only legal external import. Cross-boundary shapes the views carry (PromptConfig,
// UserIntent, guided-action) are never re-exported here — callers import them from @orb/contracts/preset.

export { SYSTEM_DEFAULT_PRESET_ID } from "./constants";
export type { PresetOpCode } from "./contract/errors";
export { PRESET_OP_CODES, PresetNotFoundError, PresetOperationError } from "./contract/errors";
export type {
  CreatePresetParams,
  GetPresetParams,
  ListPresetsParams,
  RemovePresetParams,
  ResetToDefaultParams,
  UpdatePresetParams,
} from "./contract/params";
export type {
  ExportPresets,
  ImportPreset,
  PresetExportFile,
  PresetImportOutcome,
} from "./contract/portability";
export type { PresetContext, PresetService } from "./contract/service";
export type { PresetDetail, PresetSummary } from "./contract/views";
export { ensureSystemDefaultPreset } from "./seed";
export { createPresetService } from "./service";
export { createExport as createExportPresets } from "./verbs/export";
export { createImport as createImportPresets } from "./verbs/import";
