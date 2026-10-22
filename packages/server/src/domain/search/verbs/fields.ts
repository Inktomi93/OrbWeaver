// The lexical BM25 verbs `fields` and `suggest`, over one owner's TTL-cached index (`substrate/field-index.ts`).
// `fields` names its hits through the owner-scoped display read, so a card deleted since the index was built
// drops out instead of rendering as a bare id.

import type { FieldSearchParams, SuggestParams } from "../contract/params.ts";
import type { FieldSearchResult, SearchSuggestion } from "../contract/results.ts";
import type { SearchContext, SearchService } from "../contract/service.ts";
import { loadCardFields } from "../persistence/cards.ts";
import { resolveCharacterDisplay } from "../persistence/display.ts";

export function createFields(ctx: SearchContext): SearchService["fields"] {
  return async (params: FieldSearchParams): Promise<FieldSearchResult> => {
    const ranked = await ctx.fieldIndex.fields(params, ctx.now(), () => loadCardFields(ctx.db, params.ownerId));
    const displays = await resolveCharacterDisplay(
      ctx.db,
      params.ownerId,
      ranked.hits.map((hit) => hit.characterId),
    );
    const byId = new Map(displays.map((display) => [display.characterId, display]));
    return {
      coverage: ranked.coverage,
      hits: ranked.hits.flatMap((hit) => {
        const display = byId.get(hit.characterId);
        return display === undefined ? [] : [{ characterId: hit.characterId, score: hit.score, name: display.name, avatarHash: display.avatarHash }];
      }),
    };
  };
}

export function createSuggest(ctx: SearchContext): SearchService["suggest"] {
  return async (params: SuggestParams): Promise<SearchSuggestion[]> =>
    await ctx.fieldIndex.suggest(params, ctx.now(), () => loadCardFields(ctx.db, params.ownerId));
}
