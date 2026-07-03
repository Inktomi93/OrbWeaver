import { tv } from "tailwind-variants";

// The radio-group skin — a vertical stack of labeled options (rpg-design/11 §16, "who runs the
// game"). Each item is a circle: bg-input/border-border at rest, primary fill + a light dot when
// selected; the ::before pseudo lifts the hit area to the touch floor (§4b axis 3).
export const radioGroupVariants = tv({
  slots: {
    root: "flex flex-col gap-row",
    // has-data-readonly: the item itself carries data-readonly (Base UI), not the wrapping label —
    // the same has-* pattern already used by combobox/autocomplete for has-data-disabled.
    label:
      "inline-flex cursor-pointer items-center gap-row text-body leading-body text-foreground has-data-readonly:cursor-default",
    item: [
      "relative inline-flex size-section shrink-0 cursor-pointer items-center justify-center rounded-full border border-border bg-input",
      "transition-colors duration-(--motion-fast) ease-out-expo",
      "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      "data-checked:border-primary data-checked:bg-primary",
      "data-disabled:pointer-events-none data-disabled:opacity-50",
      // Read-only (A3): NOT the disabled grey-out — border/fill keep their normal token colors;
      // only the cursor + the Lock glyph (below) signal the blocked state.
      "data-readonly:cursor-default",
      // Base UI sets data-invalid on the Root when wrapped in an invalid <Field> (FieldRootState).
      "data-invalid:border-destructive data-invalid:focus-visible:ring-destructive",
      "before:absolute before:top-1/2 before:left-1/2 before:size-touch-target before:-translate-x-1/2 before:-translate-y-1/2 before:content-['']",
    ],
    indicator: "group flex items-center justify-center",
    dot: "hidden size-field rounded-full bg-primary-foreground group-data-[checked]:block group-data-[readonly]:hidden",
    // The read-only signal (A3): hidden by default, shown only when Base UI sets data-readonly on
    // the indicator — takes precedence over the selected dot (mirrors Checkbox/Switch).
    readOnlyIcon: "hidden text-primary-foreground group-data-[readonly]:block",
  },
});
