// The words the greeting strip prints and a spec locates controls by. A zero-import leaf, so a spec reads them without the component graph.

/** The toolbar that picks which greeting the bubble shows. */
export const GREETINGS_STRIP_LABEL = "Greetings";

/** One greeting's name by its 1-based position: the pill text and the edit field's accessible name. */
export function greetingOrdinalLabel(position: number): string {
  return `Greeting ${position}`;
}

export const ADD_GREETING_NAME = "Add greeting";
export const REMOVE_GREETING_NAME = "Remove greeting";

export const FIRST_GREETING_ALWAYS_SHOWN_NOTE = "The first greeting is always shown, so it has no toggle. Open an alternate to limit it to group chats.";

/** The greeting preview's door to the generation studio. */
export const GREETING_STUDIO_NAME = "Studio";

/** The greeting preview's switch from reading to editing. */
export const GREETING_EDIT_NAME = "Edit";

/** The studio's generate verb. */
export const GREETING_MAKE_NEW_NAME = "Make new";
