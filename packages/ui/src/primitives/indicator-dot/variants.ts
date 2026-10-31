import { TONE_ARMS, tv } from "#lib";

// The childless 6px circle that means "something is here". `solid` fills with the tone's solid role. `outline` is a ring
// for the absent state: no fill, and the border on the tone's text ink because the tone edge is too faint to read at this
// size. No separating ring: the host's ground changes (background, card, a hovered ghost), so a fixed ring colour is wrong
// on some of them. The dot separates by sitting in its host's corner, and its position belongs to the call site.
// The field step is the one dot diameter in the app; `shrink-0` keeps it square in a flex row.
export const indicatorDotVariants = tv({
  base: "inline-flex shrink-0 rounded-full select-none block-field inline-field",
  variants: {
    tone: TONE_ARMS,
    variant: {
      solid: "bg-tone-solid",
      outline: "border border-tone-text bg-transparent",
    },
  },
  defaultVariants: { tone: "neutral", variant: "solid" },
});
