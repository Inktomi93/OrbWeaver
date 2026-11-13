// The accessible names the This-chat tab's injections, overrides, prose and group sections print. A zero-import leaf, so a
// spec's node side reads them without loading the component graph.

/** The This-chat tab's counted sections, each a disclosure whose name is the label and then its count. */
export const CHAT_INJECTIONS_SECTION_LABEL = "Injections";
export const CHAT_DOCUMENTS_SECTION_LABEL = "Documents";
export const CHAT_WORLD_BOOKS_SECTION_LABEL = "World books";
export const CHAT_FORKS_SECTION_LABEL = "Forks";

/** An injection row's label, which leads its disclosure's name: the word, then the row's place in the list. */
export const CHAT_INJECTION_ROW_LEAD = "Injection";
export function injectionRowLabel(ordinal: number): string {
  return `${CHAT_INJECTION_ROW_LEAD} ${String(ordinal)}`;
}

/** The injections list's add control. */
export const CHAT_ADD_INJECTION_NAME = "Add injection";

/** One injection row's remove trigger. */
export const CHAT_REMOVE_INJECTION_NAME = "Remove injection";

/** The injection remove confirm's title. */
export const CHAT_REMOVE_INJECTION_TITLE = "Remove this injection?";

/** The Scenario override row's label and field name. */
export const CHAT_OVERRIDE_SCENARIO_LABEL = "Scenario";

/** An override row's state word: set here, or inherited from the character or preset. */
export function overrideStateWord(isSet: boolean): string {
  return isSet ? "overridden" : "inheriting";
}

/** An override row's disclosure name: its label and its state word. */
export function overrideRowName(label: string, isSet: boolean): string {
  return `${label}, ${overrideStateWord(isSet)}`;
}

/** A customized prose slot's reset trigger and its confirm's commit. */
export const PROSE_RESET_NAME = "Reset to built-in";

/** A stale prose slot's door to the updated built-in wording. */
export const PROSE_USE_NEW_WORDING_NAME = "Use the new wording";

/** A stale prose slot's door that keeps the user's wording. */
export const PROSE_KEEP_MINE_NAME = "Keep mine";

/** The Group behavior disclosure's kicker. */
export const CHAT_GROUP_BEHAVIOR_NAME = "Group behavior";

/** The group form's output choice. */
export const GROUP_OUTPUT_FIELD_NAME = "How the characters reply";

/** The group form's speaker-tag switch. */
export const GROUP_SPEAKER_TAGS_NAME = "Label each speaker";

/** The group form's turn policy select. */
export const GROUP_POLICY_FIELD_NAME = "Who speaks each round";

/** The group form's own-card-only switch. */
export const GROUP_OWN_CARD_ONLY_NAME = "Each character sees only their own card";

/** The group form's member card visibility select. */
export const GROUP_VISIBILITY_FIELD_NAME = "How much of each member the others see";
