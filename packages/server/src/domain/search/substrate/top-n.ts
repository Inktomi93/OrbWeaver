// domain/search/substrate/top-n — the ONE guard on the caller's `topN` before it becomes a scan budget.
// Every ranked verb multiplies `topN` by an over-fetch factor (`substrate/constants.ts`) and hands the product
// to a `LIMIT`. SQLite reads a NEGATIVE limit as NO LIMIT, so a caller passing `-1` did not get a small
// answer — it got a full unbounded vector scan of the owner's corpus. Transport validates `topN` too
// (`z.number().int().positive().max(SEARCH_TOP_N_MAX)`); the domain re-guards rather than trust its callers,
// the same posture `SEARCH_LENS_REQUIRED` takes on the images lens.

import { SEARCH_INVALID_TOP_N, SearchError } from "../contract/errors.ts";

/** Refuse a `topN` that is not a positive whole number, naming the verb that was asked. */
export function requirePositiveTopN(topN: number, verb: string): void {
  if (!Number.isInteger(topN) || topN <= 0) {
    throw new SearchError(SEARCH_INVALID_TOP_N, `${verb} needs a positive whole topN — got ${String(topN)}`);
  }
}
