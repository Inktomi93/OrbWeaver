import { TONE_INK, tv } from "#lib";

// The glyph paints `currentColor`, so `tone` is the icon's ink by meaning, from the one map Text shares.
export const iconVariants = tv({
  variants: {
    tone: TONE_INK,
    // A glyph that sits over art or a bubble fill (the message action cluster) lifts off it with the smallest shadow step.
    shadow: {
      true: "drop-shadow-sm",
      false: "",
    },
  },
  defaultVariants: { tone: "default", shadow: false },
});
