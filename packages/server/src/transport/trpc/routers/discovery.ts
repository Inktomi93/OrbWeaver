// transport/trpc/routers/discovery — the read-side discovery analytics (core/Tier-4-Transport.md; the corpus→
// discovery rename). authed; reads take a positional `userId` = the resolved `Principal.userId` (audit #1:
// no caller-supplied owner). The `compute*` passes are workload-driven (the jobs runners), NOT tRPC. Thin:
// validate → `ctx.services.discovery.<verb>` → map errors. The `level` axis derives from `THEME_LEVELS`.

import type { CharacterId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { THEME_LEVELS } from "#domain/discovery";
import { authedProcedure, t } from "../trpc";

export const discoveryRouter = t.router({
  // PD-40 write-half, on-demand: distill ONE owned character into `character_summaries` + staged `pending`
  // tag suggestions (the editor "Suggest tags" button). Owner-scoped — `ownerId` is the resolved principal
  // (audit #1: no caller-supplied owner), so a foreign/missing character is a no-op (never a cross-owner write).
  // The whole-library batch is the `distill-characters` workload (not tRPC). Returns the pass summary.
  suggestCharacterTags: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.discovery.distillCharacters({
        characterId: input.characterId,
        ownerId: ctx.auth.userId,
      }),
    ),

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
