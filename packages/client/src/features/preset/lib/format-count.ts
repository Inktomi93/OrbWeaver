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

/** The CARRIER's cost cell — its substance is the conversation's or the world-info set's, so the preset
 *  cannot price it. An em dash, never `~0` (a zero with a bar under it is a lie with a number on it). */
export const CARRIER_COST_GLYPH = "~—";

/**
 * The SPOKEN form of a cost cell (side-eye F-27). The visible cell is a compressed mono glyph — `~30`,
 * `~—` — and a screen reader reads exactly that: "tilde three zero", "tilde em dash". The glyph is
 * therefore `aria-hidden` at every call site and THIS string stands beside it in an `sr-only` span.
 *
 * `null` tokens are the carrier arm and get the sentence the visible `~—` is shorthand for, so the two
 * modalities carry the same fact rather than one of them carrying a punctuation mark.
 */
export function spokenEstimate(tokens: number | null): string {
  return tokens === null ? "cost not counted — this section's substance comes from the conversation" : `approximately ${formatCount(tokens)} tokens`;
}

/**
 * The EDITABLE-VALUE number grammar (crunch-list 9, extended by side-eye F-23): RAW digits, no locale
 * grouping, for every `NumberField` on the preset surface.
 *
 * Distinct from `formatCount` above and deliberately so — the two answer different questions. A token COUNT
 * is a magnitude you read and compare down a column, so it groups; a knob VALUE is a string you TYPE, and a
 * field that reformats what you typed into `1,500` while the placeholder beside it ghosts `200000` speaks
 * two grammars for one column. Base UI runs this same format over the field's committed value AND over its
 * derived `min`/`max` bounds description, which is where the split was still visible after the deck was
 * fixed: `"Between 1 and 64000"` (a knob row) sat in the same a11y tree as `"Between 0 and 100,000"` (the
 * inject-depth field, which had never been passed a format at all). One family, two spellings, announced.
 *
 * Every preset-surface `NumberField` takes this — that is what makes "one grammar" a property of the
 * surface rather than of whichever call site remembered.
 */
export const PRESET_NUMBER_FORMAT: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 6 };
