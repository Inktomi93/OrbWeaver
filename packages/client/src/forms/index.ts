// forms/ front door — the editor layer (UI-Arch §2.1): the ONE createFormHook instance + the two
// editor factories + the bound-field contexts. The §13.4 map decides which factory a surface uses;
// a hand-rolled useAppForm outside a factory is the review flag (and `no-direct-useform` bans raw
// useForm everywhere but here).

export type { AutosaveStatusProps } from "./autosave-status.tsx";
export { AutosaveStatus } from "./autosave-status.tsx";
// The character-capped-field affordances (side-eye PROSE-LIMIT): the near-cap counter + the autosize
// ceiling, shared by every editor whose field carries a `maxLength`.
export type { CappedFieldCounterProps } from "./capped-field.tsx";
export { CappedFieldCounter } from "./capped-field.tsx";
export { CAPPED_FIELD_MAX_ROWS, showsCappedFieldCounter } from "./capped-field-model.ts";
export { useFieldContext, useFormContext } from "./contexts.ts";
// D78 session-boundary autosave factory (autosave-form-doctrine.md §1–§6) — the ONE autosave form entry:
// a module-scope `createAutosaveEntityForm<TValues>(config)` returns the boundary COMPONENT that owns
// identity, reseed, the teardown flush, and the store-subscription save driver (the internal hook is
// unexported by construction).
// The persistence seam is declared at EXACTLY ONE place, as a COMPILE fact (client-forms-01): a config
// without `save` mints a boundary whose props are `{ save } | { readOnly: true }` — a display-only mount
// says so, and a seamless one no longer exists.
export { createAutosaveEntityForm } from "./create-autosave-entity-form.tsx";
export type {
  AutosaveBoundaryProps,
  AutosaveBoundaryPropsPersisting,
  AutosaveBoundaryPropsReadOnly,
  AutosaveBoundaryPropsSeamRequired,
  AutosaveEntityBoundaryConfig,
  AutosaveEntityBoundaryConfigWithoutSave,
  AutosaveEntityBoundaryConfigWithSave,
  AutosaveSaveState,
  AutosaveSession,
} from "./create-autosave-entity-form-model.ts";
export type { FormHandleBridge } from "./create-form-handle-bridge.ts";
export { createFormHandleBridge } from "./create-form-handle-bridge.ts";
export type { SavedEntityFormArgs, SavedEntityFormConfig } from "./create-saved-entity-form.ts";
export { createSavedEntityForm } from "./create-saved-entity-form.ts";
export { hashServerBaseline, mirrorDraft, readDraftSeed } from "./entity-form-base.ts";
export type { SaveCircuitBreaker, SaveCircuitBreakerConfig } from "./save-circuit-breaker.ts";
export { createSaveCircuitBreaker, DEFAULT_SAVE_BREAKER } from "./save-circuit-breaker.ts";
// The settings-section save-status seam (SET-SEAMS §3): sections REPORT, the settings shell renders ONE
// aggregate footer, retry stays local.
export {
  SaveStatusHostContext,
  SaveUnwritableContext,
  useReportSaveStatus,
  useSaveStatusHosted,
  useSaveUnwritable,
  useSaveUnwritableRef,
} from "./save-status-seam.ts";
export type { SectionSaveStatusProps } from "./section-save-status.tsx";
export { SectionSaveStatus } from "./section-save-status.tsx";
export type { AppFormInstance } from "./use-app-form.ts";
export { useAppForm } from "./use-app-form.ts";
