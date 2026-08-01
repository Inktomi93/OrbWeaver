import { DISABLED_STATE, DISABLED_STATE_NATIVE, FIELD_CONTROL, FIELD_CONTROL_BOX, FOCUS_RING, FOCUS_RING_DESTRUCTIVE, tv } from "#lib";

// The text-input skin — the shared FIELD_CONTROL box + h-control-sm floor (the ≥44px law, §4b axis 3).
export const inputVariants = tv({
  base: [
    "placeholder:text-muted-foreground",
    "transition-colors duration-(--motion-fast) ease-out-expo",
    "outline-none",
    FOCUS_RING,
    DISABLED_STATE_NATIVE,
    DISABLED_STATE,
    "data-invalid:border-destructive",
    FOCUS_RING_DESTRUCTIVE,
  ],
  variants: {
    // THE INPUT'S SCALE — and with it the height rule. `field` is the form control (the default, unchanged).
    // `inline` is the CLICK-TO-EDIT twin of Button's `size="inline"`: the input that replaces a datum in
    // place must occupy the SAME visual slot the display did (owner no-shift bar), so it is text-height with
    // the datum's own inset and type, keeping only the chrome that marks it editable (border + bg-input).
    //
    // It is a VARIANT and not a call-site className for a MEASURED reason: `twMerge("h-control-sm","h-auto")`
    // and `twMerge("px-block","px-field")` each keep BOTH classes (custom-token utilities are unclassifiable,
    // twMerge 3.6), so the shipped call sites had to write `!h-auto !px-field` — an !important escape that
    // also slips past the ui-size-via-variant gate. The scale can only be chosen HERE (Button `media`/`wrap`,
    // TabsTab `stacked` precedent). Pinned by COMPUTED box in tests/ui/primitives/input/input.ct.tsx.
    layout: {
      field: [FIELD_CONTROL, "h-control-sm"],
      inline: [FIELD_CONTROL_BOX, "h-auto min-h-0 px-field py-0 text-label leading-label"],
    },
  },
  defaultVariants: { layout: "field" },
});
