import type { ToneStamp } from "#lib";
import { SWATCH_LADDER_PIGMENT, tv } from "#lib";
import type { PigmentScope } from "#tokens";

// A decorative mark that IS its colour: a palette sample, a presence dot, a preview's pane, a running hairline. The
// caller sizes and places it; the swatch owns its fill, its shape and its edge, so a feature never paints a box.
export const swatchVariants = tv({
  base: "block",
  variants: {
    // The running hairline is one device pixel tall; the caller sets only the inline length.
    indeterminate: { true: "orb-indeterminate-hairline block-px", false: "" },
    fill: {
      none: "",
      foreground: "bg-foreground",
      muted: "bg-muted-foreground",
      primary: "bg-primary",
      // The primary fill held back, for a mark that runs (an indeterminate hairline) rather than one you read.
      primaryFaint: "bg-tone-edge",
      success: "bg-success",
      // A brightness ladder in the foreground over whatever ground the swatch sits on, for a preview that shows
      // surfaces stepping apart by shade. Each step clears the 1.5:1 separation floor against the one below it.
      step1: "bg-(--pigment-swatch-ladder-step-1)",
      step2: "bg-(--pigment-swatch-ladder-step-2)",
      step3: "bg-(--pigment-swatch-ladder-step-3)",
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
      outline: "ring ring-border",
      dashed: "border border-dashed border-border",
    },
  },
  defaultVariants: { fill: "none", shape: "square", edge: "none" },
});

/** The D336 tone each fill stamps; only the held-back primary reads a tone role. */
export const SWATCH_FILL_TONE = {
  none: null,
  foreground: null,
  muted: null,
  primary: null,
  primaryFaint: "primary",
  success: null,
  step1: null,
  step2: null,
  step3: null,
} as const satisfies Record<keyof typeof swatchVariants.variants.fill, ToneStamp>;

/** The D336 pigment scope each fill stamps; only the brightness ladder reads one. */
export const SWATCH_FILL_PIGMENT = {
  none: null,
  foreground: null,
  muted: null,
  primary: null,
  primaryFaint: null,
  success: null,
  step1: SWATCH_LADDER_PIGMENT,
  step2: SWATCH_LADDER_PIGMENT,
  step3: SWATCH_LADDER_PIGMENT,
} as const satisfies Record<keyof typeof swatchVariants.variants.fill, PigmentScope | null>;
