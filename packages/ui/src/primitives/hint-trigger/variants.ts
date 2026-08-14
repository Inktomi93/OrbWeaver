import { tv } from "#lib";

// The hint-trigger skin — an info-icon ghost button that opens a Tooltip (§16, 2026-08-09 report card).
// `shrink-0` is the whole base: both call sites mount it inside a flex row beside a label/heading
// (Field's labelRow, Section's headingRow) and the trigger must never compress under that sibling's
// text. Sizing/color is entirely `<Button size intent>`'s job; each caller's own `hintTrigger()` slot
// class (fieldVariants/sectionVariants) rides in via `className`, composed last per the house pattern.
export const hintTriggerVariants = tv({
  slots: {
    trigger: "shrink-0",
  },
});
