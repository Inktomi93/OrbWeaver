// The accessible names and run statuses the regex editor, tester and pipeline panels print. A zero-import leaf, so a spec's node side reads
// them without loading the component graph.

/** The editor's find field. */
export const REGEX_FIND_PATTERN_NAME = "Find pattern";

/** The tester's input. */
export const REGEX_SAMPLE_TEXT_NAME = "Sample text";

/** The pipeline panel's input, named apart from the tester's. */
export const REGEX_TEXT_GOING_IN_NAME = "Text going in";

/** The pipeline panel's output after every stage. */
export const REGEX_TEXT_AFTER_EVERY_SCRIPT_NAME = "Text after every script";
export const REGEX_REPLACE_WITH_NAME = "Replace with";

/** The regex library's group label, which names its pane and its filter box. */
export const REGEX_GROUP_LABEL = "Regex scripts";

/** The collection's file import and bulk select doors. */
export const REGEX_IMPORT_SCRIPT_NAME = "Import a regex script";
export const REGEX_SELECT_SCRIPTS_NAME = "Select scripts";
/** The bulk bar's switch pair, which changes only whether the selected scripts run. */
export const REGEX_BULK_ENABLE_NAME = "Enable";
export const REGEX_BULK_DISABLE_NAME = "Disable";
/** The bulk bar's verb that opens the axes picker for the selection. */
export const REGEX_BULK_AXES_NAME = "Change what they change and when";

/** The collection's create verb and the inline create form it opens. */
export const REGEX_NEW_SCRIPT_NAME = "New script";
export const REGEX_SCRIPT_NAME_FIELD_NAME = "Script name";

/** The member editor's name field. */
export const REGEX_NAME_FIELD_NAME = "Name";

/** The tester's output field. */
export const REGEX_RESULT_NAME = "Result";

/** The editor's what-text field. */
export const REGEX_TARGETS_FIELD_NAME = "What it changes";

/** The editor's when field, and the four choices it offers. Each choice says what it does; its description names
 *  the matching SillyTavern box. */
export const REGEX_WHEN_FIELD_NAME = "When it runs";
export const REGEX_WHEN_CHOICE_NAMES = {
  save: "Change the saved message",
  display: "Change only what you see",
  prompt: "Change only what the model reads",
  displayAndPrompt: "Change what you see and what the model reads",
} as const;

/** The depth bounds and the switch for the reply a continue extends. */
export const REGEX_DEPTH_FROM_NAME = "From (messages back)";
export const REGEX_DEPTH_TO_NAME = "To (messages back)";
export const REGEX_DEPTH_CONTINUED_NAME = "Also the reply being continued";

/** The author scope's two lists. */
export const REGEX_AUTHORS_ONLY_NAME = "Only messages from";
/** The author lists' add controls; each list's name follows them in the accessible name. */
export const REGEX_AUTHORS_ADD_NAME = "Add";
export const REGEX_AUTHORS_ADD_CHARACTER_NAME = "Add a character";
export const REGEX_AUTHORS_CLOSE_CHARACTERS_NAME = "Close the character list";
/** The two room-standing choices in the author lists. "Other players" and not "Members": it matches a seated human
 *  who is not the host, and a character's row or a departed person's row matches neither. */
export const REGEX_STANDING_HOST_NAME = "The host";
export const REGEX_STANDING_MEMBER_NAME = "Other players";
export const REGEX_AUTHORS_NOT_NAME = "Not messages from";

/** The confirm before a move to the save choice drops a set depth range or author scope. */
export const REGEX_SAVE_CLEARS_SCOPE_TITLE = "Clear how far back it reaches and whose messages it changes?";
export const REGEX_SAVE_CLEARS_SCOPE_DESCRIPTION =
  "A script that changes the saved message runs on every message as it is saved, so it has no depth range and no whose-messages lists. Switching clears this script's.";
export const REGEX_SAVE_CLEARS_SCOPE_CONFIRM_NAME = "Clear them and switch";

/** The run-on-edit switch, shown beside the save choice. */
export const REGEX_RUN_ON_EDIT_NAME = "Run on edit";

/** The pipeline panel's two selects. */
export const REGEX_PIPELINE_TEXT_NAME = "Text";
export const REGEX_PIPELINE_WHEN_NAME = "When";

/** A tester or pipeline status while the run for the text on screen has not answered yet. */
export const REGEX_PREVIEW_RUNNING = "Running…";

/** A script stopped at the Worker's deadline, in the tester or in a pipeline stage. */
export const REGEX_PREVIEW_STOPPED = "Stopped: this pattern ran too long, so it is off until you reload the page. Change the pattern to try it again.";

/** A script the browser could not run because it could not start the Worker. */
export const REGEX_PREVIEW_UNAVAILABLE = "This browser could not start the regex runner, so the pattern did not run.";
