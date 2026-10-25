import { tv } from "#lib";

/**
 * Separator skin — a token-colored hairline rule (`bg-border`, D43 §11.4). Orientation picks which
 * axis collapses to 1px; the other stretches to fill its container (ui-package-design §5).
 */
export const separatorVariants = tv({
  base: "shrink-0 bg-border",
  variants: {
    orientation: {
      horizontal: "block-px inline-full",
      vertical: "block-full inline-px",
    },
    // The rule in the primary ink at low strength: a boundary in a transcript that names a region (the context line).
    tone: { border: "", primary: "bg-primary/35" },
  },
  defaultVariants: { orientation: "horizontal", tone: "border" },
});
