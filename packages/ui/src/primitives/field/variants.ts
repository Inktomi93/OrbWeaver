import { tv } from "#lib";

export const fieldVariants = tv({
  slots: {
    root: "flex w-full flex-col gap-field",
    label: "text-label font-medium leading-label text-foreground data-disabled:opacity-50",
    // The label + hint-icon pairing (§ hint prop) — inline-flex so the trigger sits on the label's
    // baseline instead of dropping to its own line.
    labelRow: "inline-flex items-center gap-field",
    hintTrigger: "text-muted-foreground hover:text-foreground",
    description: "text-label leading-label text-muted-foreground",
    error: "text-label leading-label text-destructive",
    // Horizontal (settings-row) grammar only — the left label block + the fixed right control column.
    labelBlock: "flex min-w-0 flex-col gap-field",
    controlCol: "flex shrink-0 flex-col items-end gap-field",
  },
  variants: {
    // UIP-404 settings-row grammar: label + description LEFT, control docked RIGHT in a fixed ~200px
    // column so controls align and a select can't stretch to 100%. Default `vertical` = the classic
    // stacked field (every existing caller unaffected).
    orientation: {
      vertical: {},
      horizontal: {
        // Stacks back to vertical BELOW the md container breakpoint (§4b axis 1 — @container): at a narrow
        // pane width the fixed control column would otherwise starve the label block toward 0 (the in-flow
        // squeeze class). Requires a `<Container>` ancestor; without one the query never matches and the
        // row stays horizontal (its default) — safe.
        root: "flex-row items-start justify-between gap-row @max-md:flex-col @max-md:items-stretch @max-md:justify-start",
        controlCol: "w-(--width-control-col) @max-md:w-full @max-md:items-stretch",
      },
    },
  },
  defaultVariants: { orientation: "vertical" },
});
