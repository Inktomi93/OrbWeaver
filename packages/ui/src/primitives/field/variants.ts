import { tv } from "#lib";

export const fieldVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    // inline-flex so the hint trigger sits on the label's baseline instead of dropping to its own line.
    labelRow: "inline-flex items-center gap-field",
    hintTrigger: "text-muted-foreground hover:text-foreground",
    description: "text-label leading-label text-muted-foreground",
    error: "text-label leading-label text-destructive",
    labelBlock: "flex min-w-0 flex-col gap-field",
    controlCol: "flex shrink-0 flex-col items-end gap-field",
  },
  variants: {
    // Label + description left, control docked right in a fixed control column so a select can't stretch to 100%.
    orientation: {
      vertical: {},
      horizontal: {
        // Stacks back to vertical below the md container breakpoint so a narrow pane doesn't starve the label block.
        root: "flex-row items-start justify-between gap-row @max-md:flex-col @max-md:items-stretch @max-md:justify-start",
        controlCol: "w-(--width-control-col) @max-md:w-full @max-md:items-stretch",
      },
    },
  },
  defaultVariants: { orientation: "vertical" },
});
