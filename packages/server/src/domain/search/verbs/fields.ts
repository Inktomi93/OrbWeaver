// domain/search/verbs/fields — the lexical BM25 engine (PD-37): `fields` (full lexical card search) +
// `suggest` (autocomplete). TWO engines, ONE domain — vector + lexical are complementary retrieval
// surfaces on the same `SearchService`; a caller picks the surface by verb, never a backend. Both verbs
// resolve the owner's per-owner MiniSearch index (built + TTL-cached in `substrate/field-index.ts` over the
// `persistence/cards.ts` corpus read) and query it. The index BUILD is the only I/O (a cache miss loads the
// owner's cards); on a cache hit neither verb touches the db.
//
// Owner-scope is the corpus itself: the loaded index holds ONLY `characters.ownerId = ownerId` cards (D20),
// so a lexical hit can never cross owners. `ctx.now()` is the injected clock the cache reads for TTL
// freshness (`no-raw-clock`).

import type { FieldSearchParams, SuggestParams } from "../contract/params";
import type { FieldSearchHit, SearchSuggestion } from "../contract/results";
import type { SearchContext, SearchService } from "../contract/service";
import { loadCardFields } from "../persistence/cards";
import { getOrBuildFieldIndex, queryFields, suggestFields } from "../substrate/field-index";

export function createFields(ctx: SearchContext): SearchService["fields"] {
  return async (params: FieldSearchParams): Promise<FieldSearchHit[]> => {
    const index = await getOrBuildFieldIndex(params.ownerId, ctx.now(), () =>
      loadCardFields(ctx.db, params.ownerId),
    );
    return queryFields(index, params.query, params.topN);
  };
}

export function createSuggest(ctx: SearchContext): SearchService["suggest"] {
  return async (params: SuggestParams): Promise<SearchSuggestion[]> => {
    const index = await getOrBuildFieldIndex(params.ownerId, ctx.now(), () =>
      loadCardFields(ctx.db, params.ownerId),
    );
    return suggestFields(index, params.query, params.limit);
  };
}
