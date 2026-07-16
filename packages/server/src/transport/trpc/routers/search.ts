// transport/trpc/routers/search — the vector-search surface (core/Tier-4-Transport.md). authed; the verbs take a
// scalar `ownerId` (the one cleanly owner-scoped vector table; D20 scope DERIVES from the producer),
// supplied from the resolved `Principal.userId` — never client input (audit #1: no caller-supplied owner).
// Thin: validate → `ctx.services.search.<verb>` → map errors.

import { imageLensSchema } from "@orb/contracts/embeddings";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { SEARCH_TARGETS } from "#domain/search";
import { authedProcedure, t } from "../trpc";

const searchInput = z.object({
  query: z.string().min(1),
  topN: z.number().int().positive(),
  rerank: z.boolean().optional(),
});

const imagesInput = searchInput.extend({
  lens: imageLensSchema,
});

// The unified omnibox: one query + one target surface + one scope. `scope` is the discriminated WHERE axis
// (owner-wide · one chat · one character across all chats — the membership-widened cross-chat scope). Ids
// inside the scope are owner-belted inside the domain (a foreign id → empty, never another tenant's data).
const searchScopeInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("owner") }),
  z.object({
    kind: z.literal("chat"),
    chatId: brandedId<ChatId>(),
    scopedCharacterId: brandedId<CharacterId>().optional(),
  }),
  z.object({ kind: z.literal("character"), characterId: brandedId<CharacterId>() }),
]);

const unifiedSearchInput = z.object({
  query: z.string().min(1),
  topN: z.number().int().positive(),
  over: z.enum(SEARCH_TARGETS),
  scope: searchScopeInput,
  rerank: z.boolean().optional(),
  lens: imageLensSchema.optional(),
});

// The seed-vector similarity verbs take a seed characterId (owner-belted inside the domain — the seed read
// returns nothing for a foreign id, so a stranger gets an empty result, never another tenant's neighbourhood).
const similarCharactersInput = z.object({
  characterId: brandedId<CharacterId>(),
  topN: z.number().int().positive(),
});

const similarArtInput = similarCharactersInput.extend({
  lens: imageLensSchema.optional(),
});

export const searchRouter = t.router({
  knn: authedProcedure.input(searchInput).query(({ ctx, input }) =>
    ctx.services.search.knn({
      ownerId: ctx.auth.userId,
      query: input.query,
      topN: input.topN,
      rerank: input.rerank,
    }),
  ),

  findCharacters: authedProcedure.input(searchInput).query(({ ctx, input }) =>
    ctx.services.search.findCharacters({
      ownerId: ctx.auth.userId,
      query: input.query,
      topN: input.topN,
      rerank: input.rerank,
    }),
  ),

  images: authedProcedure.input(imagesInput).query(({ ctx, input }) =>
    ctx.services.search.images({
      ownerId: ctx.auth.userId,
      query: input.query,
      topN: input.topN,
      lens: input.lens,
      rerank: input.rerank,
    }),
  ),

  fields: authedProcedure.input(z.object({ query: z.string().min(1), topN: z.number().int().positive() })).query(({ ctx, input }) =>
    ctx.services.search.fields({
      ownerId: ctx.auth.userId,
      query: input.query,
      topN: input.topN,
    }),
  ),

  suggest: authedProcedure.input(z.object({ query: z.string().min(1), limit: z.number().int().positive() })).query(({ ctx, input }) =>
    ctx.services.search.suggest({
      ownerId: ctx.auth.userId,
      query: input.query,
      limit: input.limit,
    }),
  ),

  discover: authedProcedure.input(searchInput).query(({ ctx, input }) =>
    ctx.services.search.discover({
      ownerId: ctx.auth.userId,
      queryText: input.query,
      topN: input.topN,
      rerank: input.rerank,
    }),
  ),

  similarCharacters: authedProcedure.input(similarCharactersInput).query(({ ctx, input }) =>
    ctx.services.search.similarCharacters({
      ownerId: ctx.auth.userId,
      characterId: input.characterId,
      topN: input.topN,
    }),
  ),

  similarArt: authedProcedure.input(similarArtInput).query(({ ctx, input }) =>
    ctx.services.search.similarArt({
      ownerId: ctx.auth.userId,
      characterId: input.characterId,
      topN: input.topN,
      lens: input.lens,
    }),
  ),

  // PD-38 unified dispatch: query + target + scope → the matching verb's hits, tagged by `over`. Owner =
  // resolved principal (audit #1). Any ids in `scope` are owner-belted in the domain (cross-tenant-swept).
  search: authedProcedure.input(unifiedSearchInput).query(({ ctx, input }) =>
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
});
