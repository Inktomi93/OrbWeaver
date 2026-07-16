// forms/ front door — the editor layer (UI-Arch §2.1): the ONE createFormHook instance + the two
// editor factories + the bound-field contexts. The §13.4 map decides which factory a surface uses;
// a hand-rolled useAppForm outside a factory is the review flag (and `no-direct-useform` bans raw
// useForm everywhere but here).

export type { AutosaveStatusProps } from "./autosave-status";
export { AutosaveStatus } from "./autosave-status";
export { useFieldContext, useFormContext } from "./contexts";
export type {
  AutosaveEntityFormArgs,
  AutosaveEntityFormConfig,
  AutosaveSaveState,
} from "./create-autosave-entity-form";
export { createAutosaveEntityForm } from "./create-autosave-entity-form";
export type { FormHandleBridge } from "./create-form-handle-bridge";
export { createFormHandleBridge } from "./create-form-handle-bridge";
export type { SavedEntityFormArgs, SavedEntityFormConfig } from "./create-saved-entity-form";
export { createSavedEntityForm } from "./create-saved-entity-form";
export { mirrorDraft, readDraftSeed } from "./entity-form-base";
export type { AppFormInstance } from "./use-app-form";
export { useAppForm } from "./use-app-form";
