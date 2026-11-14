// The room-launch surfaces' control and state names that their e2e specs locate. Homed in `lib` beside
// `chatWithActionName` because a spec's node side loads this barrel, while the chat feature door pulls stylesheets.

/** The Chats section's no-selection state. */
export const NO_CHAT_SELECTED_TITLE = "No chat selected";

/** The one door that opens the new-chat picker: the Chats no-selection state's, and Home's start control. */
export const START_NEW_CHAT_NAME = "Start a new chat";

/** The new-chat picker dialog's title, and the label of its modal trigger. */
export const NEW_CHAT_DIALOG_TITLE = "New chat";

/** The press that starts a fresh chat with an open character: the character hero's primary, and the chats pane's empty-state action while that hero is covered. */
export const CHARACTER_NEW_CHAT_NAME = "New chat";

/** The Home temp-chat tile's control, which opens the picker for a temporary room. */
export const START_TEMP_CHAT_NAME = "Start a temp chat";

/** The picker's start with no character seated. */
export const BLANK_CHAT_NAME = "Blank chat";

/** The badge a temporary room wears, in the picker before it exists and in the topbar for its whole life. */
export const TEMPORARY_CHAT_BADGE = "Temporary";
