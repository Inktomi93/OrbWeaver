// The automation rule surfaces' control names and fixed lines: the rule list, row, editor and the owner's
// library-wide section. Zero imports, so a Node-side spec and the Playwright config can read it.

/** The rule editor's region. */
export const RULE_EDITOR_NAME = "Rule editor";

/** The rule editor's close button, on the editor and on its unreadable and deleted states. */
export const RULE_EDITOR_CLOSE_NAME = "Close editor";

/** The editor's line under its save status. */
export const RULE_EDITOR_AUTOSAVE_NOTE = "Edits save automatically when complete. New rules start off; enable the rule separately when you are ready.";

/** The rule name field. */
export const RULE_NAME_FIELD_NAME = "Rule name";

/** The switch that lets a rule react to events another rule caused. */
export const RULE_INCLUDE_AUTOMATION_EVENTS_NAME = "Include events caused by automation";

/** The heading over the editor's ordered action cards. */
export const RULE_ACTIONS_ORDER_TEXT = "Actions run in this order";

/** The action picker under the action cards and the button that adds its choice. */
export const RULE_ACTION_PICKER_NAME = "Action to add";
export const RULE_ADD_ACTION_NAME = "Add action";

/** The study action's output group and its switches, which its confirm warning also names. */
export const RULE_OUTPUTS_NAME = "Outputs";
export const RULE_GUIDANCE_OUTPUT_NAME = "Guidance";
export const RULE_WORLD_BOOK_NAME = "World book";
export const RULE_SUGGESTED_TURNS_NAME = "Suggested turns";
export const RULE_REWRITE_OUTPUT_NAME = "Rewrite suggestions";
export const RULE_SCORE_VARIABLE_NAME = "Score variable";

/** The keyword list's add button. */
export const RULE_ADD_KEYWORD_NAME = "Add keyword";

/** The image action's door to an explicit size. */
export const RULE_CHOOSE_IMAGE_SIZE_NAME = "Choose image size";

/** The tool action's fields. */
export const RULE_TOOL_FIELD_NAME = "Tool";
export const RULE_TOOL_ARGUMENTS_NAME = "Argument template (JSON)";
export const RULE_CAPTURE_TOOL_RESULT_NAME = "Capture tool result";

/** The character field's line when its saved character no longer resolves. */
export const RULE_CHARACTER_UNAVAILABLE_TEXT = "The selected character is unavailable. Its saved identity is retained until you replace it.";

/** The rule list's preset picker: its trigger and its first step's title. */
export const RULE_ADD_NAME = "Add a rule";

/** The run-now verb, on a row's overflow menu and on a rate-capped rule's invitation card. */
export const RULE_RUN_NOW_NAME = "Run now";

/** A row's run-now item, which says when the run costs a model call. */
export function ruleRunNowName(spends: boolean): string {
  return spends ? `${RULE_RUN_NOW_NAME}: spends a model call` : RULE_RUN_NOW_NAME;
}

/** A row's dry-run button. */
export function ruleTestName(ruleName: string): string {
  return `Test ${ruleName}`;
}

/** The status block a dry run leaves on its row. */
export function ruleTestResultName(ruleName: string): string {
  return `Test result for ${ruleName}`;
}

/** A row's disclosure over the connections its spending actions use. */
export function ruleConnectionsName(ruleName: string): string {
  return `Connections for ${ruleName}`;
}

/** The toasts a failed rule create and a failed rule save raise. */
export const RULE_CREATE_FAILED_TOAST = "Couldn't create that rule. Your draft is kept.";
export const RULE_SAVE_FAILED_TOAST = "Couldn't save that rule. Your draft is kept.";

/** The library-wide section's fire cap field and its opening line. */
export const OWNER_RULE_RATE_FIELD_NAME = "Runs per hour";
export const OWNER_RULES_INTRO = "These rules watch your library and act on their own. No chat has to be open.";
