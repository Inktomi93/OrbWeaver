// A turn may survive a missing or rebuilding index, never an unrelated query/provider failure.

import { SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING, SearchError } from "../contract/errors.ts";
import type { RetrievalFallback } from "../contract/retrieval.ts";

function isSpaceRefusal(err: unknown): boolean {
  return err instanceof SearchError && (err.code === SEARCH_SPACE_REINDEXING || err.code === SEARCH_NO_SPACE);
}

/** Report and degrade only space refusals; every other rejection retains its identity. */
export async function withRetrievalDegrade<T>(run: () => Promise<T>, degraded: RetrievalFallback<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (!isSpaceRefusal(err)) {
      throw err;
    }
    degraded.onIndexUnavailable?.();
    return degraded.empty;
  }
}
