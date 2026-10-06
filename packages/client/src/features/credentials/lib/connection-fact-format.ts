/** Digit grouping for a COUNT. Deliberately not `toLocaleString`/`Intl`: these are token counts and vector
 *  widths, not dates or money, and the `no-raw-intl-time` gate exists because a bare `.toLocale*()` is Intl
 *  by the back door — un-memoized and locale-drifting — in a surface whose whole job is a stable reading. */
export function grouped(value: unknown): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function tokens(value: unknown): string {
  return `${grouped(value)} tokens`;
}

// A sampler's plain name from its key ("repetitionPenaltyRange" → "repetition penalty range").
export function samplerWords(knob: string): string {
  return knob.replaceAll(/([A-Z])/gu, " $1").toLowerCase();
}
