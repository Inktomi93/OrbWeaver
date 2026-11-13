// The accessible names the preset section drill-in prints. A zero-import leaf, so a spec's node side reads them without
// loading the component graph.

/** The section delete confirmation's title. */
export const PRESET_DELETE_SECTION_TITLE = "Delete this section?";
export const PRESET_BACK_TO_RACK_NAME = "Back to rack";
export const PRESET_SECTION_ACTIONS_NAME = "Section actions";
export const PRESET_EDITOR_NAME = "Preset editor";
export const PRESET_NAME_FIELD_NAME = "Preset name";
export const PRESET_RENAME_NAME = "Rename preset";
export const PRESET_SECTIONS_NAME = "Preset sections";
export const PRESET_IMPORT_TITLE = "Import a preset";

/** The variable editor's question field. */
export const PRESET_VARIABLE_QUESTION_NAME = "Question";

/** The variable editor's door to a new option row. */
export const PRESET_VARIABLE_ADD_OPTION_NAME = "Add option";
export const PRESET_IMPORT_NAME = "Import preset";

/** The editor header's activate command; the list's radiogroup names the same pick differently. */
export const PRESET_ACTIVATE_NAME = "Activate: use this preset for generation";

/** The editor header's reset door, its name and tooltip alike. */
export const PRESET_RESET_ARRANGEMENT_NAME = "Reset to starter arrangement";

/** The reset door's confirm. */
export const PRESET_RESET_ARRANGEMENT_TITLE = "Reset to the starter arrangement?";

/** The library pane's search field. */
export const PRESET_SEARCH_NAME = "Search presets";

/** The library rows' radiogroup: which preset generation uses. */
export const PRESET_ACTIVE_RADIOGROUP_NAME = "Active preset for generation";

/** The label every door that creates a blank preset wears, and the name the new row takes. */
export const NEW_PRESET_NAME = "New preset";
export const NEW_PRESET_KIND = "generation";

/** The section drill-in's name field. */
export const PRESET_SECTION_NAME_FIELD_NAME = "Name";

/** The list band's inline create door; its icon-only and menu forms wear {@link NEW_PRESET_NAME}. */
export const PRESET_NEW_LABEL = "New";

/** The rack toolbar's add-section menu trigger, which also names the menu it opens. */
export const PRESET_ADD_SECTION_LABEL = "Add";

/** The template drill-in's return to the Actions list. */
export const PRESET_BACK_TO_ACTIONS_NAME = "Back to actions";

/** The editor's view tabs, by view id. */
export const PRESET_EDITOR_VIEW_LABELS = {
  params: "Params",
  prompt: "Prompt",
  actions: "Actions",
  data: "Data",
  transforms: "Transforms",
} as const;

/** The section menu's zone jump, from the side of the conversation the section sits on now. */
export function presetMoveToZoneLabel(inSetup: boolean): string {
  return inSetup ? "Move below the conversation" : "Move above the conversation";
}

/** The section drill-in region, named for the section it edits. */
export function presetSectionEditorName(section: string): string {
  return `${section}: section editor`;
}

/** The template drill-in region, named for the template it edits. */
export function presetTemplateEditorName(template: string): string {
  return `${template}: template editor`;
}
