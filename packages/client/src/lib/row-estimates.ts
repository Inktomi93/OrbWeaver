// The first-paint row heights a windowed list seeds its virtualizer with. Every row re-measures after mount, so a guess only
// decides how many rows the first frame windows; one step per row anatomy keeps two lists of the same anatomy from drifting.

/** Estimated row height in px, by what the row draws. */
export const ESTIMATED_ROW_PX = {
  /** A name and one meta line. */
  compact: 44,
  /** A name over a scent subtitle. */
  subtitled: 52,
  /** An avatar, a title and a subtitle. */
  avatar: 60,
  /** A rank, a title, a subtitle and trailing figures. */
  ranked: 64,
  /** A two-line entity row. */
  entity: 72,
  /** A portrait row. */
  portrait: 80,
} as const;
