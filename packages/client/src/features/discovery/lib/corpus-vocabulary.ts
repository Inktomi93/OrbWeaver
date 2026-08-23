// HOW A RAW ANALYTICS VALUE IS SPOKEN ON THE CORPUS SURFACE — the display rules the distillation and
// caption passes hand this section, in one home (side-eye corpus re-pass 2026-08-19, P3-2 + P3-4; the
// census rule joined them for #535).
//
// Both exist because the wire's vocabulary is a MACHINE's: the distiller writes lower-case facet tokens
// (`fantasy`, `melancholic`) and the VL breakdown writes the literal token `none` for an image it could not
// classify. Neither was ever meant to be read as-is, and both reached a reader unchanged — one shouted in
// all-caps kicker voice, the other printed as a family whose name was the word "none".
//
// The VALUES DO NOT CHANGE. These are display projections at the render edge only: the label a filter
// matches on, the key a chart groups by, and everything the server stores stay exactly the token they were.

import { formatCount } from "./corpus-analysis-state.ts";

/**
 * A 0-1 similarity as THE surface's one similarity spelling — a whole percent (P2-5).
 *
 * Four places on this section print a cosine and three of them printed it differently: the dossier said
 * 25%, the Visuals tab "Mean fit 0.31", the Similarity tab "1.00". Same kind of number, three scales, none
 * of them stated — so a reader who learned one still could not read the next. A whole percent is the
 * spelling that reads higher-is-better without a legend, and the digit it drops (0.8813 vs 0.8809) is noise
 * nobody can act on.
 */
export function percent(value: number): string {
  return `${Math.round(value * PERCENT_SCALE)}%`;
}

const PERCENT_SCALE = 100;

/** The token the labelling passes write when a facet produced nothing to say. Matched case-insensitively —
 *  it arrives from a VL caption breakdown, not from a closed enum. */
const UNCLASSIFIED_TOKENS = new Set(["none", "unknown", "n/a", ""]);

/** What an un-labelled group is CALLED. "Unclassified" states that the pass ran and found nothing to name;
 *  "none" reads as a family whose members share the property of being nothing. */
const UNCLASSIFIED_LABEL = "Unclassified";

/**
 * A data string in SENTENCE CASE — the display casing for a value the reader is meant to read as prose
 * (a facet chain, a cluster's headline facets).
 *
 * The alternative these replace is `voice="kicker"`, which UPPERCASES: a kicker is a section's NAME, and
 * eight of them on this surface were carrying DATA — tag chains 45-59 characters long, set in 9.5px caps
 * with .09em tracking, which is the register a label wears and the worst one a sentence can. The voice
 * moved; this is the casing that makes the lower-case token look deliberate rather than unformatted.
 */
export function sentenceCase(value: string): string {
  return value === "" ? value : `${value[0]?.toUpperCase() ?? ""}${value.slice(1)}`;
}

/** A facet/cluster label as a reader meets it: the un-classified tokens become "Unclassified", everything
 *  else is sentence-cased. The underlying value is untouched — this is the last step before the pixels. */
export function facetLabel(value: string): string {
  return UNCLASSIFIED_TOKENS.has(value.trim().toLowerCase()) ? UNCLASSIFIED_LABEL : sentenceCase(value.trim());
}

/**
 * THE CORPUS CENSUS — a distilled count that NAMES ITS BASE (issue #535, the one-pass denominator rule).
 *
 * THE DEFECT, in one frame on the populated library: the LIST band read `CORPUS 313`, the CONTEXT band read
 * `Corpus 313`, and the overview's h1 between them read "327 characters". Three numbers, two of them bare,
 * none of them saying what it was OUT OF — so the only available reading is that two of them disagree about
 * the size of the library. They do not: 313 is how many cards the distiller has read, 327 is how many the
 * user owns, and the 14 in between are the fact the surface was hiding. The rail's family row was fixed the
 * same way in the same pass (`corpus-analysis-state.ts`: `8 families · 242 of 327 characters`); this is that
 * rule applied to the two bands, from the `discovery.catalog` payload all four surfaces already share.
 *
 * A COMPLETE library prints the bare number. `313 of 313` is a denominator that says nothing and costs the
 * band eight characters of a 48px chrome row — the base only earns its place while it differs, which is the
 * same rule `chartLabelWithDenominator` and the nearest-pairs cap already follow.
 */
export function distilledCensus(distilled: number, characters: number): number | string {
  return distilled < characters ? `${formatCount(distilled)} of ${formatCount(characters)}` : distilled;
}
