// The accessible names the roster modal and Home tile print. A zero-import leaf, so a spec's node side reads them without
// loading the component graph.

/** The saved-rosters modal's title, its surface trigger and its list. */
export const ROSTER_SAVED_NAME = "Saved rosters";

/** The Home tile's trailing door to the saved-rosters modal. */
export const ROSTER_ALL_NAME = "All rosters";

/** The member editor's name field. */
export const ROSTER_NAME_FIELD_NAME = "Name";

/** The settings collection group, and so the Back that returns to it. */
export const ROSTER_GROUP_LABEL = "Rosters";

/** The saved-roster delete confirmation's title. */
export const ROSTER_DELETE_TITLE = "Delete this roster?";

/** A roster's start door, which recites what applying it brings (`rosterCountsSuffix`). */
export function rosterStartChatName(roster: string, counts: string): string {
  return `Start a chat with ${roster}${counts}`;
}

/** A saved roster's delete door, which keeps a bare name. */
export function rosterDeleteName(roster: string): string {
  return `Delete ${roster}`;
}
