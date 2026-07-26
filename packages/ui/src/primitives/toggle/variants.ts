import { ACCENT_HOVER, CONTROL_SIZE, DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING, tv } from "#lib";

// The toggle skin — a pressable on/off button (bold/italic-style controls). Muted at rest; the
// pressed state (data-pressed) flips to bg-accent (or bg-primary for the primary intent). Sizes ride
// the CONTROL_SIZE ramp (shared with Button) so the ≥44px touch floor holds by construction (§4b axis 3).
//
// SELECTION CUE (side-eye a11y receipt): the neutral pressed fill (bg-accent 0.285) sits only ΔL≈0.03
// above the group's bg-muted (0.255), so selection read almost entirely from text brightening — a weak
// cue for low-vision users. The Ember inset-ring restores a saturated, lightness-INDEPENDENT selection
// signal on both intents. `inset-ring-*` (--tw-inset-ring-shadow) is a distinct box-shadow layer from
// FOCUS_RING's `ring-*` (--tw-ring-shadow), so the two compose without collision — the focus-visible
// ring still stacks on top when the pressed control is keyboard-focused.
export const toggleVariants = tv({
  base: [
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap rounded-control font-sans font-medium text-muted-foreground",
    `transition-colors duration-(--motion-fast) ease-out-expo ${ACCENT_HOVER}`,
    "outline-none",
    FOCUS_RING,
    "data-pressed:bg-accent data-pressed:text-accent-foreground data-pressed:inset-ring-2 data-pressed:inset-ring-ring",
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
