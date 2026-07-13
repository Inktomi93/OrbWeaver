// domain/search/contract/errors — typed domain errors. SearchError is a coded operational failure,
// extending kit's DomainOperationError. Deliberately NOT a SearchError: the rerank role's not-supported
// throw — search does not catch-and-rewrap it and does not silently fall back to CSLS order.

import { DomainOperationError } from "@orb/kit/errors";

export const SEARCH_EMPTY_QUERY = "empty_query";

/** A chat-memory verb keying to a digest block was called without an egocentric scopedCharacterId; we
 *  throw rather than mint an empty-string sentinel. */
export const SEARCH_SCOPE_REQUIRED = "scope_required";

export class SearchError extends DomainOperationError {
  constructor(code: string, message: string) {
    super(code, message);
    this.name = this.constructor.name;
  }
}
