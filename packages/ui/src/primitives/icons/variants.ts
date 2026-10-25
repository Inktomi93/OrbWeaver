import { HOVER_YIELD, OPEN_TURN, PULSE, RECEDED, TONE_INK, tv } from "#lib";

// The glyph paints `currentColor`, so `tone` is the icon's ink by meaning, from the one map Text shares.
export const iconVariants = tv({
  variants: {
    size: {
      xs: "block-(--size-icon-xs) inline-(--size-icon-xs)",
      sm: "block-(--size-icon-sm) inline-(--size-icon-sm)",
      md: "block-(--size-icon-md) inline-(--size-icon-md)",
      lg: "block-(--size-icon-lg) inline-(--size-icon-lg)",
      fit: "block-full inline-full",
    },
    weight: {
      hairline: "stroke-icon-hairline",
      regular: "stroke-icon-regular",
      bold: "stroke-icon-bold",
    },
    tone: TONE_INK,
    // A glyph that sits over art or a bubble fill (the message action cluster) lifts off it with the smallest shadow step.
    shadow: {
      true: "drop-shadow-sm",
      false: "",
    },
    receded: { true: RECEDED, false: "" },
    pulse: { true: PULSE, false: "" },
    // A disclosure chevron a consumer places itself: it turns with the trigger's open panel.
    openTurn: { true: OPEN_TURN, false: "" },
    // A rest-visible marker that steps aside while its ListRow's revealed cluster shows the same fact.
    yieldOnHover: { true: HOVER_YIELD, false: "" },
  },
  defaultVariants: { size: "md", weight: "regular", tone: "default", shadow: false, receded: false, pulse: false, openTurn: false, yieldOnHover: false },
});
