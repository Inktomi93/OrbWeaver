// A focus hand-off can land on a programmatic focus target (`tabIndex={-1}`, no outline of its own) because nothing inside it can
// take focus: an emptied list, a Back whose row is gone. The controls inside normally draw the ring for such a target, and here
// there are none, so the hand-off marks the target with this attribute and `FOCUS_RING_LANDING` draws the ring until focus leaves.

/** The attribute a landed target carries while it holds the hand-off's focus; `FOCUS_RING_LANDING` keys on it, so the two change together. */
export const FOCUS_LANDING_ATTRIBUTE = "data-focus-landing";
