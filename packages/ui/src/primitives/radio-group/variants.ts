import { SELECTION_CONTROL, tv } from "#lib";

// Each item is a circle: bg-input/border-input-border at rest, primary fill + a light dot when selected.
// SELECTION_CONTROL supplies the shared frame + state machine + the ::before touch-target hit area;
// the radio layers its `rounded-full` and the checked primary fill.
export const radioGroupVariants = tv({
  slots: {
    root: "flex flex-col gap-row",
    // `pointer-coarse:min-h-(--size-touch-target)`: each item's ::before hit area is touch-target tall and centred on
    // the 18px circle, so the row must be that tall too or neighbouring hit areas overlap and a low tap on
    // one item selects the next.
    label:
      "inline-flex cursor-pointer items-center gap-row text-body leading-body text-foreground pointer-coarse:min-h-(--size-touch-target) has-data-readonly:cursor-default",
    item: [SELECTION_CONTROL, "rounded-full", "data-checked:border-primary data-checked:bg-primary"],
    indicator: "group flex items-center justify-center",
    dot: "hidden size-field rounded-full bg-primary-foreground group-data-[checked]:block group-data-[readonly]:hidden",
    readOnlyIcon: "hidden text-primary-foreground group-data-[readonly]:block",
  },
});
