import { CONTROL_SIZE, DISABLED_STATE, DISABLED_STATE_NATIVE, FOCUS_RING, INKS, SELECTED_FILL_PRESSED, TONE_ARMS, tv } from "#lib";

// The toggle skin — a pressable on/off button (bold/italic-style controls). At rest it paints only the roles of its
// stamped D336 tone, so every tone works with every style. Pressed (data-pressed), it wears the one selected fill the app
// uses for a set state, whatever the tone, and no ring, so a pressed toggle never reads as the focused one.
const TONE_TINT_HOVER = "hover:bg-tone-tint-active hover:text-tone-text-on-tint";

export const toggleVariants = tv({
  base: [
    "inline-flex items-center justify-center gap-field font-sans font-medium whitespace-nowrap select-none",
    "transition-colors duration-(--motion-fast) ease-out-expo",
    "outline-none",
    FOCUS_RING,
    SELECTED_FILL_PRESSED,
    DISABLED_STATE,
    DISABLED_STATE_NATIVE,
  ],
  variants: {
    // THE FILL STYLE (D336).
    variant: {
      // No edge: a text-formatting toggle, or a view command over the pane it redraws.
      ghost: `text-tone-text ${TONE_TINT_HOVER}`,
      // THE RESTING HAIRLINE — the scope half of a filter rail (Favorites / Archived), which must read as the same
      // class of thing as the outline tag chips beside it. Pressed, it drops the edge, so the selected pill is a FILL,
      // not a fill wearing a spare outline.
      outline: `border border-tone-edge bg-transparent text-tone-text ${TONE_TINT_HOVER} data-pressed:border-transparent`,
    },
    tone: TONE_ARMS,
    // A named ink at rest; `Toggle` resolves `muted` for a neutral toggle, which recedes until pressed. A view COMMAND
    // that redraws the pane it sits above takes `foreground`: it is a control you operate, not a filter word you skim.
    ink: INKS,
    size: CONTROL_SIZE,
    // THE RADIUS AXIS — Button's own. `rounded-control` is a custom `--radius-*` token, so the radius is a declared
    // choice rather than a call-site class that tailwind-merge would resolve by order.
    shape: {
      /** The standard control box — every toggle that is a toggle. */
      control: "rounded-control",
      /** A PILL — a scope filter in a wrapping rail, beside the tag chips it shares a register with. */
      pill: "rounded-full",
    },
  },
  defaultVariants: { variant: "ghost", size: "md", shape: "control" },
});
