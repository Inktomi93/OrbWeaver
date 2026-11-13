// The accessible names the roster modal and Home tile print. A zero-import leaf, so a spec's node side reads them without
// loading the component graph.

/** The saved-rosters modal's title, its surface trigger and its list. */
export const ROSTER_SAVED_NAME = "Saved rosters";

/** The Home tile's trailing door to the saved-rosters modal. */
export const ROSTER_ALL_NAME = "All rosters";

/** The member editor's name and description fields. */
export const ROSTER_NAME_FIELD_NAME = "Name";
export const ROSTER_DESCRIPTION_FIELD_NAME = "Description";

/** The settings collection group, and so the Back that returns to it. */
export const ROSTER_GROUP_LABEL = "Rosters";

/** The saved-roster delete confirmation's title. */
export const ROSTER_DELETE_TITLE = "Delete this roster?";

/** What every roster start door's name begins with. */
export const ROSTER_START_CHAT_LEAD = "Start a chat with";

/** A roster's start door, which recites what applying it brings (`rosterCountsSuffix`). */
export function rosterStartChatName(roster: string, counts: string): string {
  return `${ROSTER_START_CHAT_LEAD} ${roster}${counts}`;
}

/** A roster's add-to-this-chat door, which recites what applying it brings (`rosterCountsSuffix`). */
export function rosterAddToChatName(roster: string, counts: string): string {
  return `Add ${roster} to this chat${counts}`;
}

/** A saved roster's delete door, which keeps a bare name. */
export function rosterDeleteName(roster: string): string {
  return `Delete ${roster}`;
}
