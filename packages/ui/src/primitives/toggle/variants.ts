import { ACCENT_HOVER, CONTROL_SIZE, DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING, tv } from "#lib";

// The toggle skin — a pressable on/off button (bold/italic-style controls). Muted at rest; the
// pressed state (data-pressed) flips to bg-accent (or bg-primary for the primary intent). Sizes ride
// the CONTROL_SIZE ramp (shared with Button) so the ≥44px touch floor holds by construction (§4b axis 3).
export const toggleVariants = tv({
  base: [
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap rounded-control font-sans font-medium text-muted-foreground",
    `transition-colors duration-(--motion-fast) ease-out-expo ${ACCENT_HOVER}`,
    "outline-none",
    FOCUS_RING,
    "data-pressed:bg-accent data-pressed:text-accent-foreground",
    DISABLED_STATE,
    DISABLED_STATE_NATIVE,
  ],
  variants: {
    intent: {
      neutral: "",
      primary: "data-pressed:bg-primary data-pressed:text-primary-foreground",
    },
    size: CONTROL_SIZE,
  },
  defaultVariants: { intent: "neutral", size: "md" },
});
