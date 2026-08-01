// transport/trpc/routers/preset — the generation-config surface (core/Tier-4-Transport.md). authed; the verbs
// take a scalar `userId` (preset is single-owner — `ownerId === userId`, no resource-role), supplied from
// the resolved `Principal.userId` (never client input). `config` derives from `@orb/contracts/preset`.

import { promptConfigSchema } from "@orb/contracts/preset";
import type { PresetId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc";

export const presetRouter = t.router({
  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        kind: z.string().min(1),
        config: promptConfigSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.preset.create({
        userId: ctx.auth.userId,
        name: input.name,
        kind: input.kind,
        ...(input.config !== undefined ? { config: input.config } : {}),
      }),
    ),

  list: authedProcedure.query(({ ctx }) => ctx.services.preset.list({ userId: ctx.auth.userId })),

  get: authedProcedure
    .input(z.object({ id: brandedId<PresetId>() }))
    .query(({ ctx, input }) => ctx.services.preset.get({ userId: ctx.auth.userId, id: input.id })),

  update: authedProcedure
    .input(
      z.object({
        id: brandedId<PresetId>(),
        name: z.string().min(1).optional(),
        kind: z.string().min(1).optional(),
        config: promptConfigSchema.optional(),
        // The copy-on-write fork intent (only meaningful when `id` is the system default) — absent means
        // `converge`, the historical silent behavior. `name` is required and non-empty on the "new" arm so a
        // nameless mint is unrepresentable; the verb de-collides it (`uniquePresetName`).
        fork: z
          .discriminatedUnion("mode", [z.object({ mode: z.literal("converge") }), z.object({ mode: z.literal("new"), name: z.string().min(1) })])
          .optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.preset.update({
        userId: ctx.auth.userId,
        id: input.id,
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.config !== undefined ? { config: input.config } : {}),
        ...(input.fork !== undefined ? { fork: input.fork } : {}),
      }),
    ),

  remove: authedProcedure
    .input(z.object({ id: brandedId<PresetId>() }))
    .mutation(({ ctx, input }) => ctx.services.preset.remove({ userId: ctx.auth.userId, id: input.id })),

  resetToDefault: authedProcedure
    .input(z.object({ id: brandedId<PresetId>() }))
    .mutation(({ ctx, input }) => ctx.services.preset.resetToDefault({ userId: ctx.auth.userId, id: input.id })),
});
