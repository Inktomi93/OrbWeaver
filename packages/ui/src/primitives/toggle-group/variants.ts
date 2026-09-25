import { tv } from "#lib";

// Pressed state lives on the child <Toggle>s themselves — don't add a pressed variant here.
export const toggleGroupVariants = tv({
  base: "inline-flex w-fit flex-wrap items-center gap-field rounded-control bg-muted p-field",
  variants: {
    // A segmented strip that spans its container in equal cells, so a narrow pane keeps the options side by
    // side and a long label wraps inside its own cell instead of dropping the whole cell to a second row.
    fill: {
      true: "grid w-full grid-flow-col auto-cols-fr [&>[data-slot=toggle]]:whitespace-normal [&>[data-slot=toggle]]:text-center",
      false: "",
    },
  },
  defaultVariants: { fill: false },
});
