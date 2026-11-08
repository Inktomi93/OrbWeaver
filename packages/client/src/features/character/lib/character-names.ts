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

/** The facet editor's return to the facet list. */
export const CHARACTER_FACET_BACK_NAME = "Back";

/** The look tab's door to seeding fields from a theme. */
export const CHARACTER_START_FROM_THEME_NAME = "Start from a theme…";

/** The history tab's empty state. */
export const CHARACTER_NO_SNAPSHOTS_TEXT = "No snapshots yet. Take one to capture this character's current state.";

/** The library's empty state before any card exists. */
export const CHARACTER_LIBRARY_EMPTY_TITLE = "No characters yet";

/** The landing's ghost door to the import dialog. */
export const CHARACTER_IMPORT_CARD_NAME = "Import a card";

/** The hero band's name field in the editor. */
export const CHARACTER_HERO_NAME_FIELD_NAME = "Name";

/** The Description facet's field. */
export const CHARACTER_DESCRIPTION_FACET_NAME = "Description";

/** The Creator notes facet's field. */
export const CHARACTER_CREATOR_NOTES_FACET_NAME = "Creator notes";

/** The failure an editor save raises, from the form submit and the save mutation alike. */
export const CHARACTER_SAVE_FAILURE = "Couldn't save the character.";

/** The context pane's world books and personas tab. */
export const CHARACTER_LINKS_TAB_LABEL = "Links";

/** The context pane's snapshot log tab. */
export const CHARACTER_HISTORY_TAB_LABEL = "History";

/** The Links tab's empty book list. */
export const CHARACTER_NO_BOOKS_LINKED_TEXT = "No world books linked.";

/** The Links tab's empty persona list. */
export const CHARACTER_NO_PERSONAS_CONNECTED_TEXT = "No personas connected.";

/** The overview's last-spoke reading when no thread exists: a time fact with no answer, not an empty slot. */
export const CHARACTER_NEVER_SPOKE_TEXT = "Never";

/** The Look tab's door that clears every override. */
export const CHARACTER_RESET_LOOK_NAME = "Reset all to Inherit";

/** The commit of that reset's confirm. */
export const CHARACTER_RESET_LOOK_CONFIRM_NAME = "Reset all";

/** The library's door out of an empty filtered view. */
export const CHARACTER_CLEAR_FILTERS_NAME = "Clear filters";

/** The library landing's shelf of characters chatted with most recently. */
export const CHARACTER_RECENT_SHELF_NAME = "Recently chatted";
