// A cmdk `filter` that ranks a row by the terms it declares before its fuzzy score. cmdk's score is at most 1,
// so the two bands above it make an exact or prefix term match outrank every fuzzy match across all groups.

import { defaultFilter } from "cmdk";

/** A query equal to one of the row's declared terms. */
const EXACT_TERM_BAND = 2;
/** A query that starts one of the row's declared terms. */
const PREFIX_TERM_BAND = 1;

/**
 * Pass as `<Command filter>`. A declared term is any `keywords` entry (a row's label rides `keywords`, because
 * cmdk never scores the rendered children). cmdk's own score still decides whether a row matches at all and
 * orders rows inside a band.
 */
export function declaredTermFirstFilter(value: string, search: string, keywords?: string[]): number {
  const fuzzy = defaultFilter(value, search, keywords);
  if (fuzzy === 0) {
    return 0;
  }
  const query = search.trim().toLocaleLowerCase();
  const terms = (keywords ?? []).map((term) => term.trim().toLocaleLowerCase());
  if (terms.includes(query)) {
    return EXACT_TERM_BAND + fuzzy;
  }
  if (terms.some((term) => term.startsWith(query))) {
    return PREFIX_TERM_BAND + fuzzy;
  }
  return fuzzy;
}
