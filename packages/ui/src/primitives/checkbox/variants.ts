import { FOCUS_RING, FOCUS_RING_DESTRUCTIVE, tv } from "#lib";

// The checkbox skin — bg-input/border-border at rest; checked and indeterminate both flip to the
// primary token with a glyph. The ::before pseudo lifts the hit area to the full touch-target
// square so the ≥44px floor holds without a giant visible box (§4b axis 3).
export const checkboxVariants = tv({
  slots: {
    root: [
      "relative inline-flex size-section shrink-0 cursor-pointer items-center justify-center rounded-control border border-border bg-input text-primary-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING,
      "data-checked:border-primary data-checked:bg-primary data-indeterminate:border-primary data-indeterminate:bg-primary",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      // Read-only (A3): NOT the disabled grey-out — border/fill keep their normal token colors;
      // only the cursor + the Lock glyph (below) signal the blocked state.
      "data-readonly:cursor-default",
      // Base UI sets data-invalid on the Root when wrapped in an invalid <Field> (FieldRootState).
      "data-invalid:border-destructive",
      FOCUS_RING_DESTRUCTIVE,
      "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
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
