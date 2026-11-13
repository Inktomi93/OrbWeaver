// The accessible names and texts the Admin pane prints. A zero-import leaf, so a spec's node side reads them without
// loading the pane's component graph. The per-row grammars (`userActionsName`, `revokeSessionName`) stay in
// `admin-model.ts` with the form shape they sit beside.

const CREATE_USER_NAME = "Create user";
const CREATING_USER_NAME = "Creating…";

/** The Users section's door, the create dialog's title, and its submit press by whether the write is in flight. */
export const ADMIN_CREATE_USER_NAME = CREATE_USER_NAME;
export function adminCreateUserLabel(creating: boolean): string {
  return creating ? CREATING_USER_NAME : CREATE_USER_NAME;
}

/** The Approvals section's lead, which says who lands there and why. */
export const ADMIN_APPROVALS_NOTE =
  "Accounts awaiting approval can't sign in until you enable them. New sign-ins through your identity provider land here when approval is required.";

/** The user row menu's door to that account's sessions. */
export const ADMIN_SESSIONS_NAME = "Sessions…";

/** The Operations section's embed-one-card control names. */
export const ADMIN_CHARACTER_ID_NAME = "Character id";
export const ADMIN_EMBED_CARD_NAME = "Embed card";

/** An override section's reset press, and its name once it carries the section it resets. */
export const ADMIN_RESET_DEFAULTS_NAME = "Reset to defaults";
export function adminResetSectionName(sectionLabel: string): string {
  return `${ADMIN_RESET_DEFAULTS_NAME}: ${sectionLabel}`;
}

/** Override fields whose names a spec finds them by. */
export const ADMIN_MAX_IMAGE_DOWNLOAD_NAME = "Max generated-image download (MB)";
export const ADMIN_PROMPT_CACHE_DEPTH_NAME = "Prompt-cache depth floor (0–20)";
export const ADMIN_MEMORY_MIN_MATCH_NAME = "Minimum match";
