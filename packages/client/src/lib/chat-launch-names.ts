// The room-launch surfaces' control and state names that their e2e specs locate. Homed in `lib` beside
// `chatWithActionName` because a spec's node side loads this barrel, while the chat feature door pulls stylesheets.

/** The Chats section's no-selection state. */
export const NO_CHAT_SELECTED_TITLE = "No chat selected";

/** The no-selection state's one door, which opens the new-chat picker. */
export const START_NEW_CHAT_NAME = "Start a new chat";

/** The Home temp-chat tile's control, which opens the picker for a temporary room. */
export const START_TEMP_CHAT_NAME = "Start a temp chat";

/** The picker's start with no character seated. */
export const BLANK_CHAT_NAME = "Blank chat";

/** The badge a temporary room wears, in the picker before it exists and in the topbar for its whole life. */
export const TEMPORARY_CHAT_BADGE = "Temporary";
