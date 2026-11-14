// The selection-control skin shared by checkbox + radio: the bordered `bg-input` box, the state
// machine (focus ring, disabled, read-only cursor, invalid border + destructive ring) and the
// touch-target hit-area pseudo. The per-control bits — rounding (`rounded-control` vs `rounded-full`),
// checkbox's `text-primary-foreground`, and each control's checked/indeterminate fill — layer on top.
import { DISABLED_STATE } from "./disabled-state.ts";
import { FOCUS_RING, FOCUS_RING_DESTRUCTIVE } from "./focus-ring.ts";
import { COLOR_MOTION } from "./state-motion.ts";

// Lifts the hit area to the full ≥44px touch-target square via a centered `::before`, so the visible
// control never has to carry the floor (§4b axis 3). Shared by checkbox/radio (via SELECTION_CONTROL)
// and switch (composed directly — its track sizing diverges from the square selection controls).
// The inline reach is capped at the 44px physical floor, or the box when the box is wider: the touch token grows with
// the text, and an uncapped square at enlarged text overhangs a small box past its column's edge, which scrolls the
// column sideways. The block axis keeps the token; a column bounds only the inline axis.
export const TOUCH_TARGET_PSEUDO =
  "before:absolute before:inset-bs-1/2 before:inset-s-1/2 before:block-(--size-touch-target) before:inline-(--size-touch-target) before:max-inline-(--size-touch-target-physical) before:min-inline-full before:-translate-x-1/2 rtl:before:translate-x-1/2 before:-translate-y-1/2 before:content-['']";

/** {@link TOUCH_TARGET_PSEUDO}'s stretched twin for a text-height control: the touch-target height, and the control's
 *  own width floored at the touch target, so a wide run of text keeps its whole width as the hit area. */
export const TOUCH_TARGET_PSEUDO_STRETCH =
  "before:absolute before:inset-bs-1/2 before:inset-s-1/2 before:block-(--size-touch-target) before:inline-full before:min-inline-(--size-touch-target) before:-translate-x-1/2 rtl:before:translate-x-1/2 before:-translate-y-1/2 before:content-['']";

export const SELECTION_CONTROL = `relative inline-flex block-(--size-checkbox) inline-(--size-checkbox) shrink-0 cursor-pointer items-center justify-center border border-input-border bg-input ${COLOR_MOTION} outline-none ${FOCUS_RING} ${DISABLED_STATE} data-readonly:cursor-default data-invalid:border-destructive ${FOCUS_RING_DESTRUCTIVE} ${TOUCH_TARGET_PSEUDO}`;
