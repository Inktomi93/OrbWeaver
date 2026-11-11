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

/** The Looks list's door to a new theme, seeded from the current one when there is one. */
export function newThemeName(current: string | undefined): string {
  return current === undefined ? "New theme…" : `New theme from ${current}…`;
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
