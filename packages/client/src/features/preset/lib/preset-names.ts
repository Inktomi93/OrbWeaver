// The accessible names the preset section drill-in prints. A zero-import leaf, so a spec's node side reads them without
// loading the component graph.

/** The section delete confirmation's title. */
export const PRESET_DELETE_SECTION_TITLE = "Delete this section?";
export const PRESET_BACK_TO_RACK_NAME = "Back to rack";
export const PRESET_SECTION_ACTIONS_NAME = "Section actions";
export const PRESET_EDITOR_NAME = "Preset editor";
export const PRESET_NAME_FIELD_NAME = "Preset name";
export const PRESET_RENAME_NAME = "Rename preset";
/** The Params deck's disclosure over the less-used knobs. */
export const PRESET_ADVANCED_NAME = "Advanced";
export const PRESET_SECTIONS_NAME = "Preset sections";
export const PRESET_IMPORT_TITLE = "Import a preset";

/** The variable editor's question field. */
export const PRESET_VARIABLE_QUESTION_NAME = "Question";

/** The variable editor's door to a new option row. */
export const PRESET_VARIABLE_ADD_OPTION_NAME = "Add option";

/** The variable editor's `ordinal`th option row, counted from 1, and its remove confirm. */
export function presetVariableOptionGroupName(ordinal: number): string {
  return `Option ${String(ordinal)}`;
}
export function presetVariableOptionRemoveTitle(ordinal: number): string {
  return `Remove option ${String(ordinal)}?`;
}
export const PRESET_IMPORT_NAME = "Import preset";

/** The editor header's activate command; the list's radiogroup names the same pick differently. */
export const PRESET_ACTIVATE_NAME = "Activate: use this preset for generation";

/** The editor header's reset door, its name and tooltip alike. */
export const PRESET_RESET_ARRANGEMENT_NAME = "Reset to starter arrangement";

/** The reset door's confirm: its title and its confirm button. */
export const PRESET_RESET_ARRANGEMENT_TITLE = "Reset to the starter arrangement?";
export const PRESET_RESET_ARRANGEMENT_CONFIRM = "Reset";

/** The library pane's search field. */
export const PRESET_SEARCH_NAME = "Search presets";

/** The library rows' radiogroup: which preset generation uses. */
export const PRESET_ACTIVE_RADIOGROUP_NAME = "Active preset for generation";

/** The label every door that creates a blank preset wears, and the name the new row takes. */
export const NEW_PRESET_NAME = "New preset";
export const NEW_PRESET_KIND = "generation";

/** The section drill-in's name field. */
export const PRESET_SECTION_NAME_FIELD_NAME = "Name";

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

/** The rack's chat history pivot; its drill door is `editActionName` over it. */
export const PRESET_CHAT_HISTORY_LABEL = "Chat history";

/** A library row's activate radio, named for the preset it picks. */
export function presetActivateRowName(preset: string): string {
  return `Activate ${preset} for generation`;
}

/** The chip the editor header and the readout wear while this preset is the active one. */
export const PRESET_ACTIVE_STATUS = "Active";

/** The library pane's list region. */
export const PRESET_LIST_NAME = "Presets list";

/** The built-in row's subtitle. */
export const PRESET_BUILT_IN_SUBTITLE = "Built-in default";

/** A text section with no name of its own, and the add menu's option that mints one. */
export const PRESET_LITERAL_TEXT_LABEL = "Literal text";

/** The Params view's quality block: its kicker and its select. */
export const PRESET_QUALITY_LABEL = "Quality";

/** The response replay lifetime field. */
export const PRESET_REPLAY_LIFETIME_NAME = "Response replay lifetime (seconds)";

/** The transforms tab's speaker-name select. */
export const PRESET_SPEAKER_NAMES_LABEL = "Speaker names";

/** The Actions view's template filter. */
export const PRESET_TEMPLATE_FILTER_NAME = "Filter templates";

/** The Data view's variables: the add door and the editor dialog's title. */
export const PRESET_ADD_VARIABLE_NAME = "Add variable";
export const PRESET_EDIT_VARIABLE_TITLE = "Edit variable";

/** The lead of a row's line naming knobs the bound model does not honor. */
export const PRESET_NOT_HONORED_LEAD = "Set but not honored by this model:";

/** The staleness row's two answers: hide the row and keep the stored knobs, or clear them. */
export const PRESET_STALE_KEEP_NAME = "Keep";
export const PRESET_STALE_CLEAR_NAME = "Clear";

/** The readout pane's heading when no preset is picked, and its active-preset block kicker. */
export const PRESET_READOUT_ACTIVE_LABEL = "Active preset";

/** The Prompt readout's budget block. */
export const PRESET_READOUT_BUDGET_LABEL = "Budget";

/** The Prompt readout's assembled-preview toggle, one name per state. */
export const PRESET_SHOW_PREVIEW_NAME = "Show assembled preview";
export const PRESET_HIDE_PREVIEW_NAME = "Hide assembled preview";

/** The Prompt readout's pricing states. */
export const PRESET_READOUT_PRICING_STATUS = "Pricing these rows against the bound chat…";
export const PRESET_READOUT_NOT_HOST_PRICED = "This chat cannot be priced. Its host resolves the prompt, and you are not it.";

/** The Actions readout's refusal for a chat the viewer does not host. */
export const PRESET_READOUT_NOT_HOST_INSPECTED = "This chat cannot be inspected. Its host resolves the prompt, and you are not it.";

/** An Actions readout row's region, named for its action. */
export function presetActionReadoutName(action: string): string {
  return `Action readout: ${action}`;
}

/** The Transforms readout's stage status when its read failed. */
export const PRESET_READOUT_STAGE_UNREAD = "couldn’t read";

/** The capability panel's connection picker. */
export const PRESET_CAPABILITY_CONNECTION_NAME = "Connection to describe";

/** The section drill-in region, named for the section it edits. */
export function presetSectionEditorName(section: string): string {
  return `${section}: section editor`;
}

/** The template drill-in region, named for the template it edits. */
export function presetTemplateEditorName(template: string): string {
  return `${template}: template editor`;
}

/** What failed to load, said by the preset library's read. */
export const PRESET_LIBRARY_READ_LABEL = "your presets";

/** What failed to load, said by the usage readout's read. */
export const PRESET_USAGE_READ_LABEL = "what uses this preset";

/** What failed to load, said by the preset readout's read. */
export const PRESET_READOUT_READ_LABEL = "the readout";

/** What failed to load, said by the transforms readout's read. */
export const PRESET_TRANSFORMS_READ_LABEL = "the attached scripts";

/** What failed to load, said by the prompt readout's bound-chat cost read. */
export const PRESET_BOUND_COSTS_READ_LABEL = "the bound chat's costs";

/** What failed to load, said by the actions readout's resolved preview read. */
export const PRESET_ACTIONS_PREVIEW_READ_LABEL = "the resolved preview";

/** The singular nouns the sequence chip lists name their add box and each chip's Remove by. */
export const PRESET_STOP_SEQUENCE_NOUN = "stop sequence";
export const PRESET_DRY_BREAKER_NOUN = "DRY sequence breaker";
export const PRESET_BANNED_PHRASE_NOUN = "banned phrase";

/** A sequence chip's subject: its list's noun, then the text it shows. */
export function sequenceChipSubject(noun: string, shown: string): string {
  return `${noun} ${shown}`;
}

/** A sequence list's add box, named for the noun it adds. */
export function sequenceAddName(noun: string): string {
  return `Add ${noun}`;
}
