// The accessible names the theme builder prints. A zero-import leaf, so a spec's node side reads them without loading the
// component graph.

/** The theme editor's name field. */
export const CONFIG_THEME_NAME_FIELD_NAME = "Theme name";

/** The theme editor's base surface colour field. */
export const CONFIG_THEME_BACKGROUND_FIELD_NAME = "Background";

/** The theme editor's custom stylesheet section. */
export const CONFIG_CUSTOM_CSS_NAME = "Custom CSS";

/** The Looks list's icon door to the theme file chooser. */
export const CONFIG_IMPORT_THEME_FILE_NAME = "Import a theme file";
export const CONFIG_MORE_LIBRARY_ACTIONS_NAME = "More library actions";
export const CONFIG_ADVANCED_THEME_TOOLS_NAME = "Show advanced theme tools";
/** The radio group of theme cards in Looks. */
export const CONFIG_THEME_GROUP_NAME = "Theme";
export const CONFIG_BACK_TO_LOOKS_NAME = "← Back to Looks";
/** The disclosure on the Appearance pane that holds the fine-tuning sections under Looks. */
export const CONFIG_CUSTOMIZE_LOOK_NAME = "Customize this look";
/** The theme card menu's item that opens an owned theme in the builder. */
export const CONFIG_EDIT_IN_BUILDER_NAME = "Edit in builder";

/** The theme editor's live preview section. */
export const CONFIG_THEME_PREVIEW_NAME = "Preview";

/** What every name of the Looks list's door to a new theme starts with. */
export const CONFIG_NEW_THEME_LEAD = "New theme";

/** The Looks list's door to a new theme, seeded from the current one when there is one. */
export function newThemeName(current: string | undefined): string {
  return current === undefined ? `${CONFIG_NEW_THEME_LEAD}…` : `${CONFIG_NEW_THEME_LEAD} from ${current}…`;
}

/** The theme editor's custom stylesheet editor. */
export const CONFIG_THEME_CSS_FIELD_NAME = "Custom theme CSS";

/** The Settings map's list page. */
export const CONFIG_SETTINGS_GROUPS_NAME = "Settings groups";

/** The pane footer's lead when something is unsaved, and the one sentence under it for each arm. A plural count composes from the same words. */
export const CONFIG_NOT_SAVED_LABEL = "Not saved";
export const CONFIG_SECTION_NEEDS_FIX_TEXT = "A section needs a fix";
export const CONFIG_SECTION_WAITING_TEXT = "A section has changes waiting for Save";
export function configSectionsNeedFixText(sections: number): string {
  return sections === 1 ? CONFIG_SECTION_NEEDS_FIX_TEXT : `${String(sections)} sections need a fix`;
}
export function configSectionsWaitingText(sections: number): string {
  return sections === 1 ? CONFIG_SECTION_WAITING_TEXT : `${String(sections)} sections have changes waiting for Save`;
}

/** The Settings map's jump search. */
export const CONFIG_SEARCH_NAME = "Search settings";

/** The jump search's empty result. */
export function configSearchEmptyText(query: string): string {
  return `No settings match “${query}”.`;
}

/** A collection landing's local filter, named for the collection. */
export function collectionFilterName(label: string): string {
  return `Filter ${label.toLowerCase()}`;
}

/** A collection landing's empty state, named for the collection. */
export function collectionEmptyTitle(label: string): string {
  return `No ${label.toLowerCase()} yet`;
}
