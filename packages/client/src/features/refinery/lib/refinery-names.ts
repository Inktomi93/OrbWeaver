// The accessible names the Refinery context tabs print. A zero-import leaf, so a spec's node side reads them without
// loading the component graph.

/** The context pane's version history tab. */
export const REFINERY_VERSIONS_NAME = "Versions";
export const REFINERY_HAND_EDIT_NAME = "Hand-edit";
export const REFINERY_ITERATE_NAME = "Iterate";
export const REFINERY_SAVE_AS_COPY_NAME = "Save as copy";
export const REFINERY_SESSION_STATE_NAME = "Session state";
export const REFINERY_SEARCH_SESSIONS_NAME = "Search sessions by character or name";
export const REFINERY_EDIT_SCOPE_NAME = "Edit scope";
/** What the Hand-edit dialog says when the scope holds no field to edit. */
export const REFINERY_HAND_EDIT_EMPTY_SCOPE = "Nothing is in scope, so there is nothing to hand-edit. Choose fields under Edit scope, then come back.";
export const REFINERY_COMPARE_NAME = "Compare";
export const REFINERY_HIDE_COMPARE_NAME = "Hide compare";

/** The compare toggle's name for its current state. */
export function refineryCompareToggleName(comparing: boolean): string {
  return comparing ? REFINERY_HIDE_COMPARE_NAME : REFINERY_COMPARE_NAME;
}
