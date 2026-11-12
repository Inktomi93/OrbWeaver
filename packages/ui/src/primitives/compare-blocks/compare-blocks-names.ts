// The review grammar's verbs. A zero-import leaf, so a spec's node side reads them without loading the primitive.
// Each verb button's accessible name is the verb, a space, then the block's label, which only assistive tech reads.

/** The verb that keeps a block's rewrite. */
export const COMPARE_KEEP_LABEL = "Keep";

/** The keep verb on a block whose rewrite empties its field. */
export const COMPARE_KEEP_CLEARED_LABEL = "Keep (empties field)";

/** The verb that keeps the live text instead. */
export const COMPARE_DISCARD_LABEL = "Discard";
