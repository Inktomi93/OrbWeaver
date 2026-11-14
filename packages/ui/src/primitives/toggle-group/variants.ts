import { CONTROL_WRAP, tv } from "#lib";

// Pressed state lives on the child <Toggle>s themselves — don't add a pressed variant here.
export const toggleGroupVariants = tv({
  base: "inline-flex flex-wrap items-center gap-field rounded-control bg-muted p-field inline-fit",
  variants: {
    // A segmented strip that spans its container in equal cells, so a narrow pane keeps the options side by
    // side and a long label wraps inside its own cell instead of dropping the whole cell to a second row. A cell's width is its share,
    // so a one-word label breaks inside its cell whether or not its caller asked for `wrap`: `wrap-anywhere` lowers the cell's
    // min-content, which an `fr` track would otherwise grow to, pushing the strip past its column.
    fill: {
      true: `
        grid auto-cols-fr grid-flow-col inline-full
        *:data-[slot=toggle]:text-center ${CONTROL_WRAP.cell}
      `,
      false: "",
    },
  },
  defaultVariants: { fill: false },
});
