// transport/trpc/routers/discovery — the read-side discovery analytics (tiers/transport.md; the corpus→
// discovery rename). authed; reads take a positional `userId` = the resolved `Principal.userId` (audit #1:
// no caller-supplied owner). The `compute*` passes are workload-driven (the jobs runners), NOT tRPC. Thin:
// validate → `ctx.services.discovery.<verb>` → map errors. The `level` axis derives from `THEME_LEVELS`.

import { z } from "zod";
import { THEME_LEVELS } from "#domain/discovery";
import { authedProcedure, t } from "../trpc";

export const discoveryRouter = t.router({
  duplicateCharacters: authedProcedure
    .input(
      z
        .object({
          limit: z.number().int().positive().optional(),
          minScore: z.number().optional(),
        })
        .optional(),
    )
    .query(({ ctx, input }) =>
      ctx.services.discovery.duplicateCharacters(ctx.auth.userId, {
        ...(input?.limit !== undefined ? { limit: input.limit } : {}),
        ...(input?.minScore !== undefined ? { minScore: input.minScore } : {}),
      }),
    ),

  themes: authedProcedure
    .input(z.object({ level: z.enum(THEME_LEVELS).optional() }).optional())
    .query(({ ctx, input }) => ctx.services.discovery.themes(ctx.auth.userId, input?.level)),
});
