// domain/search/contract/errors — typed domain errors. SearchError is a coded operational failure,
// extending kit's DomainOperationError. Deliberately NOT a SearchError: the rerank role's not-supported
// throw — search does not catch-and-rewrap it and does not silently fall back to CSLS order.

import { DomainOperationError } from "@orb/kit/errors";

export const SEARCH_EMPTY_QUERY = "empty_query";
/** The owner has no `embed`/`imageEmbed` connection bound — nothing defines their vector space. */
export const SEARCH_NO_SPACE = "search_no_space";

/** The owner's corpus has not finished moving into the space their binding now resolves to (§10-5). NOT an
 *  empty result: the query can only be embedded by the LIVE model, and every admitted embedder is 1024-wide,
 *  so scanning the last-complete space with it would return dimensionally-valid, semantically meaningless
 *  rankings. A named refusal is the only honest answer while the two disagree, and it is one a surface can
 *  explain ("re-indexing your library; search resumes when it finishes"). */
export const SEARCH_SPACE_REINDEXING = "search_space_reindexing";

/** A chat-memory verb keying to a digest block was called without an egocentric scopedCharacterId; we
 *  throw rather than mint an empty-string sentinel. */
export const SEARCH_SCOPE_REQUIRED = "scope_required";

/** The unified search() dispatch was handed a scope the chosen target can't honor (e.g. a `chat` scope on
 *  the owner-wide card surface). Flag-don't-fake — we never silently widen or narrow the requested scope. */
export const SEARCH_SCOPE_UNSUPPORTED = "scope_unsupported";

/** The unified search() `images` target was dispatched without the required `lens` (the addressable
 *  embedding space). Transport validates it too; the domain re-guards rather than default a lens. */
export const SEARCH_LENS_REQUIRED = "lens_required";

/** A ranked verb was asked for a non-positive / non-integer `topN`. It never becomes a `LIMIT` — SQLite reads
 *  a negative limit as NO limit, which turns a nonsense ask into a full corpus scan (`substrate/top-n.ts`). */
export const SEARCH_INVALID_TOP_N = "invalid_top_n";

export class SearchError extends DomainOperationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
