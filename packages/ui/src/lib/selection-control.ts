// The selection-control skin shared by checkbox + radio: the bordered `bg-input` box, the state
// machine (focus ring, disabled, read-only cursor, invalid border + destructive ring) and the
// touch-target hit-area pseudo. The per-control bits — rounding (`rounded-control` vs `rounded-full`),
// checkbox's `text-primary-foreground`, and each control's checked/indeterminate fill — layer on top.
import { DISABLED_STATE } from "./disabled-state";
import { FOCUS_RING, FOCUS_RING_DESTRUCTIVE } from "./focus-ring";

// Lifts the hit area to the full ≥44px touch-target square via a centered `::before`, so the visible
// control never has to carry the floor (§4b axis 3). Shared by checkbox/radio (via SELECTION_CONTROL)
// and switch (composed directly — its track sizing diverges from the square selection controls).
export const TOUCH_TARGET_PSEUDO =
  "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']";

export const SELECTION_CONTROL = `relative inline-flex size-checkbox shrink-0 cursor-pointer items-center justify-center border border-border bg-input transition-colors duration-(--motion-fast) ease-out-expo outline-none ${FOCUS_RING} ${DISABLED_STATE} data-readonly:cursor-default data-invalid:border-destructive ${FOCUS_RING_DESTRUCTIVE} ${TOUCH_TARGET_PSEUDO}`;
