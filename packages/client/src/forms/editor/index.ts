// forms/editor — owning editor composition: shared hook, factories, bound controls, and rendered chrome.

export type {
  AutosaveBoundaryProps,
  AutosaveBoundaryPropsPersisting,
  AutosaveBoundaryPropsReadOnly,
  AutosaveBoundaryPropsSeamRequired,
  AutosaveEntityBoundaryConfig,
  AutosaveEntityBoundaryConfigWithoutSave,
  AutosaveEntityBoundaryConfigWithSave,
  AutosaveSession,
} from "./autosave-contract.ts";
export type { AutosaveStatusProps } from "./autosave-status.tsx";
export { AutosaveStatus } from "./autosave-status.tsx";
export type { CappedFieldCounterProps } from "./capped-field.tsx";
export { CappedFieldCounter } from "./capped-field.tsx";
export { useFieldContext, useFormContext } from "./contexts.ts";
export { createAutosaveEntityForm } from "./create-autosave-entity-form.tsx";
export type { SavedEntityFormArgs, SavedEntityFormConfig } from "./create-saved-entity-form.ts";
export { createSavedEntityForm } from "./create-saved-entity-form.ts";
export type { SectionSaveStatusProps } from "./section-save-status.tsx";
export { SectionSaveStatus } from "./section-save-status.tsx";
export type { AppFormInstance } from "./use-app-form.ts";
export { useAppForm } from "./use-app-form.ts";
