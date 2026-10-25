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
} as const;
