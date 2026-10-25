import { DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING_INSET, tv } from "#lib";

// Steppers are full size-(--size-touch-target) squares; rings go inset because the group clips overflow for
// the rounded border.
export const numberFieldVariants = tv({
  slots: {
    root: `flex flex-col gap-field ${DISABLED_STATE}`,
    scrubArea: "flex cursor-ew-resize items-center gap-row text-label leading-label font-medium text-muted-foreground select-none inline-fit",
    scrubCursor: "flex text-foreground",
    group: ["flex items-stretch overflow-hidden rounded-control border border-input-border bg-field-fill inline-full", "data-invalid:border-destructive"],
    decrement: [
      `
        group flex shrink-0 cursor-pointer items-center justify-center border-e border-input-border text-foreground select-none block-(--size-touch-target)
        inline-(--size-touch-target)
      `,
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80",
      `outline-none ${FOCUS_RING_INSET}`,
      `${DISABLED_STATE_NATIVE} ${DISABLED_STATE}`,
      "data-readonly:cursor-default",
    ],
    input: [
      "bg-transparent text-foreground tabular-nums inline-full min-inline-0",
      "placeholder:text-muted-foreground",
      `outline-none ${FOCUS_RING_INSET}`,
      DISABLED_STATE,
      "data-invalid:text-destructive",
    ],
    increment: [
      `
        group flex shrink-0 cursor-pointer items-center justify-center border-s border-input-border text-foreground select-none block-(--size-touch-target)
        inline-(--size-touch-target)
      `,
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80",
      `outline-none ${FOCUS_RING_INSET}`,
      `${DISABLED_STATE_NATIVE} ${DISABLED_STATE}`,
      "data-readonly:cursor-default",
    ],
    // The bounds sentence is SR-only: it replaces the aria-valuemin/max a textbox can't carry, and the
    // visible range affordance is the field's own `<Field description>` copy, not a second line here.
    boundsDescription: "sr-only",
    stepIcon: "group-data-readonly:hidden",
    stepReadOnlyIcon: "hidden group-data-readonly:block",
  },
  // The SIZE axis owns the whole box — the field's width and the input's height/type step — because a
  // control height must not be settable from outside (the Button `size="wrap"` / TabsTab `layout="stacked"`
  // precedent). Pre-#146 the reason was that tailwind-merge could not classify the custom token, so a
  // call-site override resolved by stylesheet order; with the spacing scale registered it resolves
  // last-wins, i.e. the call site silently beats the seal. Either way the axis owns the box and nothing
  // else here may set a height.
  //
  // `md` is the default full-width form field, byte-identical to the pre-axis skin (a 44px stepper-flanked
  // input with centered body type). `inline` is the knob-row twin: a
  // stepper-less mono cell in `--width-number-inline`, right-aligned so a column of knob values reads down
  // one number edge, at the `code` type step because a slider's number twin is a datum, not prose. Its
  // input keeps `h-(--size-control-sm)` — the per-pointer control height (32px fine / 44px coarse), so an
  // instrument-density knob row still meets the coarse tap floor.
  variants: {
    size: {
      md: { root: "inline-full", input: "text-center text-field leading-field block-(--size-touch-target)" },
      inline: { root: "inline-(--width-number-inline)", input: "px-field text-end font-mono text-code-field leading-code-field block-(--size-control-sm)" },
    },
  },
  defaultVariants: { size: "md" },
});
