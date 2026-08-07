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
    // THE HORIZONTAL ROW'S CROSS-AXIS (side-eye 2026-08-06 P2). `items-start` is only right when one column
    // is genuinely MULTI-LINE: a description wraps under the label and the control must hold the FIRST line
    // rather than float to the middle of a two-line block. A row with neither a description nor an error is
    // two SINGLE-line boxes of unequal height (a `label` text step vs a `control-md` box), and `items-start`
    // pinned the label to the control's top edge — an ~8px baseline shear on every description-less settings
    // row (Appearance → "Avatar size" / "Avatar shape" / "Avatar ring" were the reported ones).
    //
    // `multiline` is the honest axis rather than "hasDescription": the ERROR node grows the control column
    // exactly the same way, so it takes the same arm. Below `@max-md` the row is stacked and `items-stretch`
    // (declared on the horizontal arm) still wins — this only ever governs the side-by-side layout.
    multiline: { true: {}, false: {} },
  },
  compoundVariants: [{ orientation: "horizontal", multiline: false, class: { root: "items-center" } }],
  defaultVariants: { orientation: "vertical", multiline: false },
});
