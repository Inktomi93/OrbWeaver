// domain/search/contract/errors — the typed domain errors (search.md §8-slot contract/errors.ts).
//   • SearchError — a coded operational failure (the `code` discriminates). Extends the kit
//     `DomainOperationError` (maps to BAD_REQUEST at the transport seam) so callers/tests discriminate
//     via the code. The one code in the W2 core is `empty_query`: the query embedded to NO usable vector
//     (an empty / whitespace query the embedder filters), so there is nothing to scan against.
//
// What is DELIBERATELY NOT a SearchError: the `rerank` role's not-supported throw (PD-11 — the hosted
// OpenRouter rerank backend typed-THROWS until a rerank-specific provider is wired; the local backend is
// the working path). `search` does NOT catch-and-rewrap that infra signal into a SearchError, and it does
// NOT silently fall back to CSLS order — the throw PROPAGATES verbatim (flag-don't-fake; the typed
// not-supported throw is the contract, search owns no fallback policy). See `verbs/knn.ts`.

import { DomainOperationError } from "@orb/kit/errors";

/** The query produced no embedding vector (empty / whitespace input the embedder filtered) — there is
 *  nothing to scan against. */
export const SEARCH_EMPTY_QUERY = "empty_query";

/** A chat-memory verb that keys results back to a digest block (`segments` / `corpus`) was called without an
 *  egocentric `scopedCharacterId`. The verbatim/segment lens has no `scopedCharacterId` column of its own, so
 *  a segment hit can only form a real `BlockKey` (inv 8: ALWAYS a real `CharacterId`, never `''`/NULL) from
 *  the caller's egocentric POV. Flag-don't-fake: we throw rather than mint an empty-string sentinel. */
export const SEARCH_SCOPE_REQUIRED = "scope_required";

export class SearchError extends DomainOperationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
