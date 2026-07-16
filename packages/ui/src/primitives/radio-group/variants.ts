import { FOCUS_RING, FOCUS_RING_DESTRUCTIVE, tv } from "#lib";

// Each item is a circle: bg-input/border-border at rest, primary fill + a light dot when selected;
// the ::before pseudo lifts the hit area to the touch floor.
export const radioGroupVariants = tv({
  slots: {
    root: "flex flex-col gap-row",
    label: "inline-flex cursor-pointer items-center gap-row text-body leading-body text-foreground has-data-readonly:cursor-default",
    item: [
      "relative inline-flex size-section shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-input",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none",
      FOCUS_RING,
      "data-checked:border-primary data-checked:bg-primary",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      "data-readonly:cursor-default",
      "data-invalid:border-destructive",
      FOCUS_RING_DESTRUCTIVE,
      "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
    ],
    indicator: "group flex items-center justify-center",
    dot: "hidden size-field rounded-full bg-primary-foreground group-data-[checked]:block group-data-[readonly]:hidden",
    readOnlyIcon: "hidden text-primary-foreground group-data-[readonly]:block",
  },
});
