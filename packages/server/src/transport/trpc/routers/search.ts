// transport/trpc/routers/search — the vector-search surface (tiers/transport.md). authed; the verbs take a
// scalar `ownerId` (the one cleanly owner-scoped vector table; D20 scope DERIVES from the producer),
// supplied from the resolved `Principal.userId` — never client input (audit #1: no caller-supplied owner).
// Thin: validate → `ctx.services.search.<verb>` → map errors.

import { z } from "zod";
import { authedProcedure, t } from "../trpc";

const searchInput = z.object({
  query: z.string().min(1),
  topN: z.number().int().positive(),
  rerank: z.boolean().optional(),
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
});
