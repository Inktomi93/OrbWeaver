// forms/ — Node-without-DOM model/store seam; owning editor composition enters through #forms/editor.

export { CAPPED_FIELD_MAX_ROWS, showsCappedFieldCounter } from "./capped-field-model.ts";
export type { AutosaveSaveState } from "./create-autosave-entity-form-model.ts";
export type { FormHandleBridge } from "./create-form-handle-bridge.ts";
export { createFormHandleBridge } from "./create-form-handle-bridge.ts";
export { hashServerBaseline, mirrorDraft, readDraftSeed } from "./entity-form-base.ts";
export type { SaveCircuitBreaker, SaveCircuitBreakerConfig } from "./save-circuit-breaker.ts";
export { createSaveCircuitBreaker, DEFAULT_SAVE_BREAKER } from "./save-circuit-breaker.ts";
export {
  SaveStatusHostContext,
  SaveUnwritableContext,
  useReportSaveStatus,
  useSaveStatusHosted,
  useSaveUnwritable,
  useSaveUnwritableRef,
} from "./save-status-seam.ts";
