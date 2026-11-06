// Selector contracts remain available without importing DOM effects.

/** The universal horizontal scroll-overflow recipe's selector contract. */
export const SCROLL_FADE_X_CLASS = "scroll-fade-x";

/** The universal vertical scroll-overflow recipe's selector contract. */
export const SCROLL_FADE_Y_CLASS = "scroll-fade-y";

/** An edge counts as hiding content only past this many px, so sub-pixel rounding never flickers a fade or a "more below" cue. */
export const SCROLL_EDGE_EPSILON_PX = 1;
