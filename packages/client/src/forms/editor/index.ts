// forms/editor — owning editor composition: shared hook, factories, bound controls, and rendered chrome.

export type { AutosaveSession } from "./autosave-contract.ts";
export type { AutosaveStatusProps } from "./autosave-status.tsx";
export { AutosaveStatus } from "./autosave-status.tsx";
export { touchedFieldError } from "./bound-fields/field-error.ts";
export { CappedFieldCounter } from "./capped-field.tsx";

export {} from "./contexts.ts";

export { createAutosaveEntityForm } from "./create-autosave-entity-form.tsx";
export { createSavedEntityForm } from "./create-saved-entity-form.ts";
export { SectionSaveStatus } from "./section-save-status.tsx";
export type { AppFormInstance } from "./use-app-form.ts";
export { useAppForm } from "./use-app-form.ts";
