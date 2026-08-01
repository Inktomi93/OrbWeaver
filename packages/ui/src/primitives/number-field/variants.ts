import { DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING_INSET, tv } from "#lib";

// Steppers are full size-touch-target squares; rings go inset because the group clips overflow for
// the rounded border.
export const numberFieldVariants = tv({
  slots: {
    root: `flex w-full flex-col gap-field ${DISABLED_STATE}`,
    scrubArea: "flex w-fit cursor-ew-resize select-none items-center gap-row text-label font-medium leading-label text-muted-foreground",
    scrubCursor: "flex text-foreground",
    group: ["flex w-full items-stretch overflow-hidden rounded-control border border-border bg-input", "data-invalid:border-destructive"],
    decrement: [
      "group flex size-touch-target shrink-0 cursor-pointer select-none items-center justify-center border-r border-border text-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80",
      `outline-none ${FOCUS_RING_INSET}`,
      `${DISABLED_STATE_NATIVE} ${DISABLED_STATE}`,
      "data-readonly:cursor-default",
    ],
    input: [
      "h-touch-target w-full min-w-0 bg-transparent text-center text-body leading-body text-foreground tabular-nums",
      "placeholder:text-muted-foreground",
      `outline-none ${FOCUS_RING_INSET}`,
      DISABLED_STATE,
      "data-invalid:text-destructive",
    ],
    increment: [
      "group flex size-touch-target shrink-0 cursor-pointer select-none items-center justify-center border-l border-border text-foreground",
      "transition-colors duration-(--motion-fast) ease-out-expo hover:bg-accent active:bg-accent/80",
      `outline-none ${FOCUS_RING_INSET}`,
      `${DISABLED_STATE_NATIVE} ${DISABLED_STATE}`,
      "data-readonly:cursor-default",
    ],
    // The bounds sentence is SR-only: it replaces the aria-valuemin/max a textbox can't carry, and the
    // visible range affordance is the field's own `<Field description>` copy, not a second line here.
    boundsDescription: "sr-only",
    stepIcon: "group-data-[readonly]:hidden",
    stepReadOnlyIcon: "hidden group-data-[readonly]:block",
  },
});
