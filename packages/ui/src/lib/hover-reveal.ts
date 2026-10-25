// The hover-reveal postures for a row's trailing actions, keyed on the nearest `group` ancestor (a ListRow root is one).
// Opacity only: a display or visibility swap under a hover key moves layout under the pointer and oscillates.
// A coarse pointer has no hover, so every arm stays visible there.
export const HOVER_REVEAL = {
  /** Hidden at rest, shown on the row's hover or focus-within. */
  hover:
    "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100",
  /** Secondary chrome (a pin, a crown): faint on the row's hover, full on its own hover or focus, always faint on touch. */
  faint:
    "opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:opacity-60 group-has-focus-visible:opacity-60 hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-40",
  /** `hover`, and also inert while hidden: a cluster that overlays content must not catch a click it does not show. */
  interactive:
    "pointer-events-none opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 pointer-coarse:pointer-events-auto pointer-coarse:opacity-100",
  /** `interactive` without the coarse arm: on touch it stays hidden, because a tap focuses the row item and not the cluster. */
  focus:
    "pointer-events-none opacity-0 transition-opacity duration-(--motion-fast) ease-out-expo group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
} as const;

/** A rest-visible marker whose fact the revealed cluster also carries (a starred row's ★): it yields while the
 *  ListRow (`group/row`) is hovered or holds focus, so the row never paints the state twice. Visibility, not
 *  display, so the title line never reflows under the pointer; a coarse pointer has no hover and keeps it. */
export const HOVER_YIELD = "group-hover/row:invisible group-focus-within/row:invisible";

/** A visible cluster that is inert to a fine pointer until its `group` row is hovered or holds focus, so a pass of
 *  the pointer over the row does not land on it. A coarse pointer keeps it live. */
export const INERT_UNTIL_HOVER =
  "pointer-fine:pointer-events-none pointer-fine:group-hover:pointer-events-auto pointer-fine:group-focus-within:pointer-events-auto";

// The cues a quiet part of a hovered `group` (a card that is one control) gives: its ink lifts to the foreground, or a
// trailing arrow nudges toward where the control goes.
export const HOVER_CUE = {
  lift: "transition-colors duration-(--motion-fast) ease-out-expo group-hover:text-foreground",
  nudge: "inline-block transition-transform duration-(--motion-fast) ease-out-expo group-hover:translate-x-tight",
} as const;
