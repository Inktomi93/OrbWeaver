import { tv } from "#lib";

// A decorative mark that IS its colour: a palette sample, a presence dot, a preview's pane, a running hairline. The
// caller sizes and places it; the swatch owns its fill, its shape and its edge, so a feature never paints a box.
export const swatchVariants = tv({
  base: "block",
  variants: {
    fill: {
      none: "",
      foreground: "bg-foreground",
      muted: "bg-muted-foreground",
      primary: "bg-primary",
      // The primary fill held back, for a mark that runs (an indeterminate hairline) rather than one you read.
      primaryFaint: "bg-primary/30",
      success: "bg-success",
      // A brightness ladder in the foreground over whatever ground the swatch sits on, for a preview that shows
      // surfaces stepping apart by shade. Each step clears the 1.5:1 separation floor against the one below it.
      step1: "bg-foreground/8",
      step2: "bg-foreground/32",
      step3: "bg-foreground/60",
    },
    shape: {
      square: "",
      pill: "rounded-full",
    },
    // `ring` is an unfilled outline in the muted ink, so a swatch can read as a state with the colour removed
    // (an offline presence dot beside a filled online one). `outline` is a hairline ring in the border ink that
    // separates a sample from any ground it lands on.
    edge: {
      none: "",
      ring: "border border-muted-foreground",
      outline: "ring-1 ring-border",
    },
  },
  defaultVariants: { fill: "none", shape: "square", edge: "none" },
});
