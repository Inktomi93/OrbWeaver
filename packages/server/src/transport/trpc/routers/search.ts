// transport/trpc/routers/search — the vector-search surface (docs/law/Tier-4-Transport.md). authed; the verbs take a
// scalar `ownerId` (the one cleanly owner-scoped vector table; D20 scope DERIVES from the producer),
// supplied from the resolved `Principal.userId` — never client input (audit #1: no caller-supplied owner).
// Thin: validate → `ctx.services.search.<verb>` → map errors.

import {
  fieldSearchInputSchema,
  fieldSearchResultSchema,
  searchSpaceStatusSchema,
  searchSuggestInputSchema,
  searchSuggestionSchema,
  similarArtHitSchema,
  similarArtInputSchema,
  unifiedSearchInputSchema,
  unifiedSearchResultSchema,
} from "@orb/contracts/search";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

export const searchRouter = t.router({
  fields: authedProcedure
    .output(fieldSearchResultSchema)
    .input(fieldSearchInputSchema)
    .query(({ ctx, input }) =>
      ctx.services.search.fields({
        ownerId: ctx.auth.userId,
        query: input.query,
        topN: input.topN,
      }),
    ),

  suggest: authedProcedure
    .output(z.array(searchSuggestionSchema))
    .input(searchSuggestInputSchema)
    .query(({ ctx, input }) =>
      ctx.services.search.suggest({
        ownerId: ctx.auth.userId,
        query: input.query,
        limit: input.limit,
      }),
    ),

  similarArt: authedProcedure
    .output(z.array(similarArtHitSchema))
    .input(similarArtInputSchema)
    .query(({ ctx, input }) =>
      ctx.services.search.similarArt({
        ownerId: ctx.auth.userId,
        characterId: input.characterId,
        topN: input.topN,
        lens: input.lens,
      }),
    ),

  // Unified dispatch: query + target + scope → the matching verb's hits, tagged by `over`. Owner =
  // resolved principal (audit #1). Any ids in `scope` are owner-belted in the domain (cross-tenant-swept).
  search: authedProcedure
    .output(unifiedSearchResultSchema)
    .input(unifiedSearchInputSchema)
    .query(({ ctx, input }) =>
      ctx.services.search.search({
        ownerId: ctx.auth.userId,
        query: input.query,
        topN: input.topN,
        over: input.over,
        scope: input.scope,
        rerank: input.rerank,
        lens: input.lens,
      }),
    ),

  // Is the caller's own vector search paused for an embedding rebuild? The vector role rows read it.
  spaceStatus: authedProcedure.output(searchSpaceStatusSchema).query(({ ctx }) => ctx.services.search.spaceStatus({ ownerId: ctx.auth.userId })),
});
