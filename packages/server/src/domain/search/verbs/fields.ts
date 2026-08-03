// domain/search/verbs/fields — the lexical BM25 engine: `fields` (full lexical card search) + `suggest`
// (autocomplete). Both resolve the owner's per-owner MiniSearch index (built + TTL-cached in
// `substrate/field-index.ts`); a cache miss loads the owner's cards, a hit touches no db. Owner-scope is
// the corpus itself — the index holds only that owner's cards, so a hit can never cross owners.

import type { SearchContext } from "../context.ts";
import type { FieldSearchParams, SuggestParams } from "../contract/params.ts";
import type { FieldSearchHit, SearchSuggestion } from "../contract/results.ts";
import type { SearchService } from "../contract/service.ts";
import { loadCardFields } from "../persistence/cards.ts";
import { getOrBuildFieldIndex, queryFields, suggestFields } from "../substrate/field-index.ts";

export function createFields(ctx: SearchContext): SearchService["fields"] {
  return async (params: FieldSearchParams): Promise<FieldSearchHit[]> => {
    const index = await getOrBuildFieldIndex(params.ownerId, ctx.now(), () => loadCardFields(ctx.db, params.ownerId));
    return queryFields(index, params.query, params.topN);
  };
}

export function createSuggest(ctx: SearchContext): SearchService["suggest"] {
  return async (params: SuggestParams): Promise<SearchSuggestion[]> => {
    const index = await getOrBuildFieldIndex(params.ownerId, ctx.now(), () => loadCardFields(ctx.db, params.ownerId));
    return suggestFields(index, params.query, params.limit);
  };
}
