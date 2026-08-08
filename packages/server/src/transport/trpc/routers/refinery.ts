// transport/trpc/routers/refinery — the card-refinery pipeline surface (R1). authed; ownership derives
// through the character join inside every verb (D23 — leak-free NOT_FOUND on foreign/absent ids, the
// cross-tenant sweep's shape). Thin: validate → `ctx.services.refinery.<verb>` → map errors. Input
// shapes derive from `@orb/contracts/refinery` (never re-spelled here); the verbs RE-parse the prose-
// bearing fields at their own boundary (the §3.A internal-caller posture) — the double parse is cheap
// and deliberate.

import {
  refinableFieldSchema,
  refineryGuidanceSchema,
  refinerySelectionSchema,
  refinerySessionNameSchema,
  refinerySessionStatusSchema,
  refineryStageConfigSchema,
  refineryStageSchema,
} from "@orb/contracts/refinery";
import type { CharacterId, RefinerySessionId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

const acceptedFieldSchema = z.object({
  field: refinableFieldSchema,
  greetingIndex: z.number().int().min(0).optional(),
});

export const refineryRouter = t.router({
  startSession: authedProcedure
    .input(z.object({ characterId: brandedId<CharacterId>(), name: refinerySessionNameSchema.nullable().optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.startSession({
        principal: ctx.auth,
        characterId: input.characterId,
        ...(input.name !== undefined ? { name: input.name } : {}),
      }),
    ),

  getSession: authedProcedure
    .input(z.object({ sessionId: brandedId<RefinerySessionId>() }))
    .query(({ ctx, input }) => ctx.services.refinery.getSession({ principal: ctx.auth, sessionId: input.sessionId })),

  listSessions: authedProcedure.query(({ ctx }) => ctx.services.refinery.listSessions({ principal: ctx.auth })),

  listRuns: authedProcedure
    .input(z.object({ sessionId: brandedId<RefinerySessionId>() }))
    .query(({ ctx, input }) => ctx.services.refinery.listRuns({ principal: ctx.auth, sessionId: input.sessionId })),

  updateSession: authedProcedure
    .input(
      z.object({
        sessionId: brandedId<RefinerySessionId>(),
        patch: z.object({
          name: refinerySessionNameSchema.nullable().optional(),
          guidance: refineryGuidanceSchema.nullable().optional(),
          selection: refinerySelectionSchema.optional(),
          stageConfig: refineryStageConfigSchema.optional(),
          status: refinerySessionStatusSchema.optional(),
        }),
      }),
    )
    .mutation(({ ctx, input }) => ctx.services.refinery.updateSession({ principal: ctx.auth, sessionId: input.sessionId, patch: input.patch })),

  deleteSession: authedProcedure
    .input(z.object({ sessionId: brandedId<RefinerySessionId>() }))
    .mutation(({ ctx, input }) => ctx.services.refinery.deleteSession({ principal: ctx.auth, sessionId: input.sessionId })),

  runStage: authedProcedure
    .input(z.object({ sessionId: brandedId<RefinerySessionId>(), stage: refineryStageSchema }))
    .mutation(({ ctx, input }) => ctx.services.refinery.runStage({ principal: ctx.auth, sessionId: input.sessionId, stage: input.stage })),

  iterate: authedProcedure
    .input(z.object({ sessionId: brandedId<RefinerySessionId>(), guidance: refineryGuidanceSchema.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.iterate({
        principal: ctx.auth,
        sessionId: input.sessionId,
        ...(input.guidance !== undefined ? { guidance: input.guidance } : {}),
      }),
    ),

  applyFields: authedProcedure
    .input(z.object({ sessionId: brandedId<RefinerySessionId>(), accepts: z.array(acceptedFieldSchema).min(1) }))
    .mutation(({ ctx, input }) => ctx.services.refinery.applyFields({ principal: ctx.auth, sessionId: input.sessionId, accepts: input.accepts })),
});
