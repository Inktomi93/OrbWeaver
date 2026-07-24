// forms/ front door — the editor layer (UI-Arch §2.1): the ONE createFormHook instance + the two
// editor factories + the bound-field contexts. The §13.4 map decides which factory a surface uses;
// a hand-rolled useAppForm outside a factory is the review flag (and `no-direct-useform` bans raw
// useForm everywhere but here).

export type { AutosaveStatusProps } from "./autosave-status";
export { AutosaveStatus } from "./autosave-status";
export { useFieldContext, useFormContext } from "./contexts";
// D78 session-boundary autosave factory (autosave-form-doctrine.md §1–§6) — the ONE autosave form entry:
// a module-scope `createAutosaveEntityForm<TValues>(config)` returns the boundary COMPONENT that owns
// identity, reseed, the teardown flush, and the store-subscription save driver (the internal hook is
// unexported by construction).
export type {
  AutosaveBoundaryProps,
  AutosaveEntityBoundaryConfig,
  AutosaveSaveState,
  AutosaveSession,
} from "./create-autosave-entity-form";
export { createAutosaveEntityForm } from "./create-autosave-entity-form";
export type { FormHandleBridge } from "./create-form-handle-bridge";
export { createFormHandleBridge } from "./create-form-handle-bridge";
export type { SavedEntityFormArgs, SavedEntityFormConfig } from "./create-saved-entity-form";
export { createSavedEntityForm } from "./create-saved-entity-form";
export { hashServerBaseline, mirrorDraft, readDraftSeed } from "./entity-form-base";
export type { SaveCircuitBreaker, SaveCircuitBreakerConfig } from "./save-circuit-breaker";
export { createSaveCircuitBreaker, DEFAULT_SAVE_BREAKER } from "./save-circuit-breaker";
export type { AppFormInstance } from "./use-app-form";
export { useAppForm } from "./use-app-form";
