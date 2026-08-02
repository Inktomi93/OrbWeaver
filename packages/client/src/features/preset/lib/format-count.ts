// ONE number format for the preset surface's token counts (side-eye F-29, 2026-08-02): the readout printed
// `1,500` two rows above a rack that printed `8192`, because three producers each formatted independently.
// A budget you read by comparing rows cannot change its digit grouping between them.
//
// `Intl.NumberFormat` at MODULE SCOPE, built once: a per-call formatter is the cost the time gate exists to
// stop, and the same reasoning applies to numbers. (That gate patrols `Intl.DateTimeFormat` /
// `RelativeTimeFormat` / `.toLocale*()` specifically — time is epoch-ms UTC threaded through `@orb/kit/time`;
// a token COUNT is not a time and has no zone, so it has no business in that seam.)
//
// The locale is FIXED, deliberately: these are engineering magnitudes rendered beside mono `datum` text
// that has to align down a column, and a locale that groups with `.` or spaces would break the alignment
// the tabular figures exist to give.

const COUNT_FORMAT = new Intl.NumberFormat("en-US");

/** A token count, grouped (`8,192`). Non-integers pass through unformatted — a temperature is not a
 *  magnitude you group, and rounding one here would be a lie with a comma in it. */
export function formatCount(value: number): string {
  return Number.isInteger(value) ? COUNT_FORMAT.format(value) : String(value);
}

/** The `~N` estimate form the rack rows and the budget bars both print. */
export function formatEstimate(value: number): string {
  return `~${formatCount(value)}`;
}
