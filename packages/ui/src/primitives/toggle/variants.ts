import { ACCENT_HOVER, CHIP_BOX, CONTROL_SIZE, DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING, tv } from "#lib";

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
    "inline-flex select-none items-center justify-center gap-field whitespace-nowrap font-sans font-medium text-muted-foreground",
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
      // THE VIEW-COMMAND REGISTER (added 2026-08-17, program #102 variant B). A toggle that REDRAWS the
      // pane it sits above (group-by-tag, bulk select) is not one of the filter words beside it, and the
      // characters pane measured both at the identical muted 13px/500 — twelve controls, four semantic
      // classes, ONE rendered treatment. Foreground ink is the whole delta: it keeps the ghost box (no
      // edge, `--radius-control`), because it is a control you operate, not a chip you skim.
      command: "text-foreground",
      // THE RESTING HAIRLINE — the scope half of the filter rail (Favorites / Archived), which must read
      // as the same class of thing as the tag chips beside it. Twin of `Button`'s `outline` intent, and
      // the reason it is a real arm rather than a call-site className: the two live in one rail and a
      // skin decided per call site is how one rail becomes two. `data-pressed` drops the resting edge so
      // the selected pill is a FILL, not a fill wearing a spare outline.
      outline: "border border-border bg-transparent data-pressed:border-transparent",
    },
    size: {
      ...CONTROL_SIZE,
      // The wrapping-rail cell — ONE home with Button's `chip` size (`CHIP_BOX`, lib/control-size.ts).
      chip: CHIP_BOX,
    },
    // THE RADIUS AXIS — Button's own (added there in #102), for the same reason and with the same
    // mechanics: `rounded-control` used to sit in `base`, and it is a custom `--radius-*` token that
    // tailwind-merge cannot classify, so `cn("rounded-control", "rounded-full")` kept BOTH and the winner
    // was decided by stylesheet order. The `control` default is byte-identical to what `base` emitted.
    shape: {
      /** The standard control box — every toggle that is a toggle. */
      control: "rounded-control",
      /** A PILL — a scope filter in a wrapping rail, beside the tag chips it shares a register with. */
      pill: "rounded-full",
    },
  },
  defaultVariants: { intent: "neutral", size: "md", shape: "control" },
});
