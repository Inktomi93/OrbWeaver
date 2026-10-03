// The Game console's segmented-toggle words: one exhaustive Record per closed contracts tuple, so a new
// member fails tsc here instead of rendering its raw value. Lives in lib/ because a component module may
// export components only.

import type { RpgCyoaChoiceBehavior, RpgDateMode, RpgExtractionContext, RpgExtractionMode } from "@orb/contracts/rpg";

/** Choice click behavior toggle words. */
export const CHOICE_BEHAVIOR_LABEL: Readonly<Record<RpgCyoaChoiceBehavior, string>> = {
  compose: "Edit first",
  send: "Send now",
};

/** Ambient date mode toggle words. */
export const DATE_MODE_LABEL: Readonly<Record<RpgDateMode, string>> = {
  narrated: "Narrated",
  structured: "Day counter",
};

/** Delivery model toggle words. They name where state gets recorded, never a cost: the cost lives in the
 *  consequence line beside the toggle. */
export const EXTRACTION_MODE_LABEL: Readonly<Record<RpgExtractionMode, string>> = {
  folded: "In the reply",
  cheap: "Separate pass",
};

/** Extraction context toggle words. */
export const EXTRACTION_CONTEXT_LABEL: Readonly<Record<RpgExtractionContext, string>> = {
  beat: "Latest beat",
  window: "Recent arc",
  full: "Whole thread",
};
