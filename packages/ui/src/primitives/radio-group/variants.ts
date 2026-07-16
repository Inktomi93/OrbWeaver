import { SELECTION_CONTROL, tv } from "#lib";

// Each item is a circle: bg-input/border-border at rest, primary fill + a light dot when selected.
// SELECTION_CONTROL supplies the shared frame + state machine + the ::before touch-target hit area;
// the radio layers its `rounded-full` and the checked primary fill.
export const radioGroupVariants = tv({
  slots: {
    root: "flex flex-col gap-row",
    label: "inline-flex cursor-pointer items-center gap-row text-body leading-body text-foreground has-data-readonly:cursor-default",
    item: [SELECTION_CONTROL, "rounded-full", "data-checked:border-primary data-checked:bg-primary"],
    indicator: "group flex items-center justify-center",
    dot: "hidden size-field rounded-full bg-primary-foreground group-data-[checked]:block group-data-[readonly]:hidden",
    readOnlyIcon: "hidden text-primary-foreground group-data-[readonly]:block",
  },
});
