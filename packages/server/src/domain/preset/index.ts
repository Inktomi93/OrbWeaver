// FRONT DOOR: the only legal external import. Re-exports the public surface — the service factory +
// the boot seeder + the system-default sentinel + the typed errors, and (type-only) the contract
// surface (the verb interface, the DI bundle, the params + views). The cross-boundary `PromptConfig` /
// `UserIntent` / guided-action shapes the views carry are NEVER re-exported here — their one home is
// `@orb/contracts/preset` (callers import them from there directly).

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
// The orb-native preset backup lane (export-import-portability.md §1, W-preset): the two portability verb
// factories + their op/result types. The entry-root registry descriptor wires `createExportPresets` /
// `createImportPresets` over the SAME `PresetContext` the service uses, and composes their `{filename,bytes}` /
// `{ok,created,error}` result shapes (structurally the delivery-core `PortableFile` / `PortableImportOutcome`)
// into the delivery core — this domain never imports the `@orb/contracts/portability` registry contract.
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
