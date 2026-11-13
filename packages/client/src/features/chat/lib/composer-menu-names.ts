// The composer's guided controls, groups and menu items that a spec locates by role and name. A zero-import leaf, so a
// spec's node side reads them without loading the component graph.

/** The Input group's rewrite and out-of-character dialog door. */
export const COMPOSER_CORRECTIONS_NAME = "Corrections…";

/** The utility menu's new swipe of the last reply. */
export const COMPOSER_REGENERATE_NAME = "Regenerate";

/** The Input group's draft eraser. */
export const COMPOSER_CLEAR_INPUT_NAME = "Clear input";

/** The Media group's door to the `/imagine` modal. */
export const COMPOSER_IMAGINE_NAME = "Imagine: modes & preview…";

/** The composer group that acts on the user's own draft. */
export const COMPOSER_YOU_GROUP_NAME = "Your message";

/** The composer group that acts on the characters' reply. */
export const COMPOSER_THEM_GROUP_NAME = "Their reply";

/** The guided reply button, before typed direction makes it guided. */
export const COMPOSER_GENERATE_REPLY_NAME = "Generate reply";

/** The guided impersonation button, before typed direction makes it guided. */
export const COMPOSER_DRAFT_LINE_NAME = "Draft your line";

/** A guided button's name: typed text in the box turns it into the guided form of its verb. */
export function guidedControlName(base: string, hasText: boolean): string {
  return hasText ? `Guided ${base.toLowerCase()}` : base;
}

/** The reply menu's item that leaves the speaker to the room. */
export const COMPOSER_LET_ROOM_PICK_NAME = "Let the room pick";

/** The persons Draft your line writes in, as its menu prints them. */
export const IMPERSONATE_PERSON_LABELS = { first: "1st person", second: "2nd person", third: "3rd person" } as const;

/** The rewrite dialog's commit. */
export const COMPOSER_REWRITE_SUBMIT_NAME = "Rewrite";
