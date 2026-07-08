// forms/ front door — the editor layer (UI-Arch §2.1): the ONE createFormHook instance + the two
// editor factories + the bound-field contexts. The §13.4 map decides which factory a surface uses;
// a hand-rolled useAppForm outside a factory is the review flag (and `no-direct-useform` bans raw
// useForm everywhere but here).

export { useFieldContext, useFormContext } from "./contexts";
export type {
  AutosaveEntityFormArgs,
  AutosaveEntityFormConfig,
} from "./create-autosave-entity-form";
export { createAutosaveEntityForm } from "./create-autosave-entity-form";
export type { SavedEntityFormArgs, SavedEntityFormConfig } from "./create-saved-entity-form";
export { createSavedEntityForm } from "./create-saved-entity-form";
export type { AppFormInstance } from "./use-app-form";
export { useAppForm, withFieldGroup, withForm } from "./use-app-form";
