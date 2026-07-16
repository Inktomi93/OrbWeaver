import { SELECTION_CONTROL, tv } from "#lib";

// The checkbox skin — bg-input/border-border at rest; checked and indeterminate both flip to the
// primary token with a glyph. SELECTION_CONTROL supplies the shared frame + state machine (focus ring,
// disabled, read-only cursor, invalid border/ring, and the ::before touch-target hit area); the
// checkbox layers its rounding, glyph text color, and the checked/indeterminate primary fill.
export const checkboxVariants = tv({
  slots: {
    root: [
      SELECTION_CONTROL,
      "rounded-control text-primary-foreground",
      "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
    ],
    indicator: "group flex items-center justify-center",
    check: "hidden text-current group-data-[checked]:block group-data-[readonly]:hidden",
    dash: "hidden text-current group-data-[indeterminate]:block group-data-[readonly]:hidden",
    // The read-only signal (A3): hidden by default, shown only when Base UI sets data-readonly on
    // the indicator — takes precedence over check/dash so read-only reads as ONE consistent mark
    // regardless of checked state (mirrors Switch's thumb-Lock treatment).
    readOnlyIcon: "hidden text-current group-data-[readonly]:block",
  },
});
