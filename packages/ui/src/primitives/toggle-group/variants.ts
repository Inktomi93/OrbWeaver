import { CONTROL_WRAP, tv } from "#lib";

// Pressed state lives on the child <Toggle>s themselves — don't add a pressed variant here.
export const toggleGroupVariants = tv({
  base: "inline-flex flex-wrap items-center gap-field rounded-control bg-muted p-field inline-fit",
  variants: {
    // A segmented strip that spans its container in equal cells. The strip wraps: a cell never gives up a whole label, so when the cells
    // cannot hold their labels side by side (enlarged text on a phone) the rest take a further row, and only a label wider than the strip
    // itself is cut. The nearest rulings are the Tabs `cells` caption floor, which never clips a caption, and this group's own wrapping rows;
    // a one-of-N choice stays whole on screen, so it does not scroll as a tab rail does.
    fill: {
      true: `inline-full ${CONTROL_WRAP.cell}`,
      false: "",
    },
  },
  defaultVariants: { fill: false },
});
