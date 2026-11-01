// The accessible names the Characters section prints on its library, editor and dialogs. A zero-import leaf, so a spec's
// node side reads them without loading the component graph.

/** The create dialog's title and the compact band button's name. */
export const CHARACTER_NEW_NAME = "New character";

/** The band's icon-only door to the import dialog, and that dialog's name. */
export const CHARACTER_IMPORT_NAME = "Import a character card";

/** The create dialog's name field. */
export const CHARACTER_NAME_FIELD_NAME = "Character name";

/** The create dialog's description field. */
export const CHARACTER_DESCRIPTION_FIELD_NAME = "Character description";

/** The library list's default name. */
export const CHARACTER_LIBRARY_NAME = "Character library";

/** The library's search box. */
export const CHARACTER_SEARCH_NAME = "Search characters";

/** The library's sort select. */
export const CHARACTER_SORT_NAME = "Sort characters";

/** The View group's flat-to-categorized toggle. */
export const CHARACTER_GROUP_BY_TAG_NAME = "Group by tag";

/** The View group's bulk mode toggle. */
export const CHARACTER_SELECT_MULTIPLE_NAME = "Select multiple";

/** The filter chip that narrows the library to archived cards. */
export const CHARACTER_SHOW_ARCHIVED_NAME = "Show archived characters";

/** The filter chip that narrows the library to starred cards. */
export const CHARACTER_SHOW_FAVORITES_NAME = "Show only favorites";

/** The tag filter box in the library's filter rail. */
export const CHARACTER_FILTER_TAGS_NAME = "Filter tags";

/** The exit of the expanded tag vocabulary. */
export const CHARACTER_FEWER_TAGS_NAME = "Show fewer tags";

/** The editor form. */
export const CHARACTER_EDITOR_NAME = "Edit character";

/** The Context pane's overflow menu trigger. */
export const CHARACTER_ACTIONS_MENU_NAME = "Character actions";

/** The single-card delete confirmation's title. */
export const CHARACTER_DELETE_TITLE = "Delete this character?";

/** The duplicate confirmation's title. */
export const CHARACTER_DUPLICATE_TITLE = "Duplicate this character?";

/** The bulk bar's delete confirmation title for a selection of `count`. */
export function characterBulkDeleteTitle(count: number): string {
  return `Delete ${count} character${count === 1 ? "" : "s"}?`;
}

/** The bulk bar's tag dialog title for a selection of `count`. */
export function characterBulkTagTitle(count: number): string {
  return `Tag ${count} character${count === 1 ? "" : "s"}`;
}

/** The tag picker dialog the editor's tag row opens. */
export const CHARACTER_TAG_DIALOG_TITLE = "Tag this character";

/** The history tab's restore confirmation. */
export const CHARACTER_RESTORE_SNAPSHOT_TITLE = "Restore this snapshot?";

/** The Links tab's pickers. */
export const CHARACTER_LINK_BOOK_NAME = "Link a book";
export const CHARACTER_CONNECT_PERSONA_NAME = "Connect a persona";

/** The library filter rail's group. */
export const CHARACTER_FILTERS_NAME = "Filters";

/** The expanded tag vocabulary's scroll region. */
export const CHARACTER_TAG_VOCABULARY_NAME = "Tag vocabulary";

/** The history tab's snapshot button. */
export const CHARACTER_SNAPSHOT_NOW_NAME = "Snapshot now";

/** The tags row's door to the tag picker. */
export const CHARACTER_ADD_TAG_NAME = "Add tag";

/** The facet editor's toggle that opens the full editor. */
export const CHARACTER_EXPAND_TO_EDIT_NAME = "Expand to edit";
