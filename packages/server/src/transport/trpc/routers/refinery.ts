// transport/trpc/routers/refinery — the card-refinery pipeline surface (R1). authed; ownership derives
// through the character join inside every verb (D23 — leak-free NOT_FOUND on foreign/absent ids, the
// cross-tenant sweep's shape). Thin: validate → `ctx.services.refinery.<verb>` → map errors. Input
// shapes derive from `@orb/contracts/refinery` (never re-spelled here); the verbs RE-parse the prose-
// bearing fields at their own boundary (the §3.A internal-caller posture) — the double parse is cheap
// and deliberate.

import {
  REFINERY_SCHEMA_DESCRIPTION_MAX,
  refinableFieldSchema,
  refineryForgeArmSchema,
  refineryGuidanceSchema,
  refineryRewriteFieldSchema,
  refinerySchemaStageSchema,
  refinerySelectionSchema,
  refinerySessionNameSchema,
  refinerySessionStatusSchema,
  refineryStageConfigSchema,
  refineryStageSchema,
} from "@orb/contracts/refinery";
import type { CharacterId, RefineryRunId, RefinerySchemaId, RefinerySessionId } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";
import { authedProcedure, t } from "../trpc.ts";

const acceptedFieldSchema = z.object({
  field: refinableFieldSchema,
  greetingIndex: z.number().int().min(0).optional(),
  // The F-T1 APPEND address: which of the chosen rewrite's NEW greetings this Keep is for (its ordinal
  // among the payload's append entries). Mutually exclusive with `greetingIndex` — the verb's belts itemize
  // a malformed pairing rather than the wire refusing the whole batch, so both stay optional here.
  appendIndex: z.number().int().min(0).optional(),
  // The §21 merge-conflict re-confirmation — spelled as the literal so a plain `true` is the only value.
  confirmDiverged: z.literal(true).optional(),
});

/** The raw schema blob — belt-parsed at the VERB (`refinerySchemaDocumentSchema`), so the wire stays a
 *  plain record here (the double parse is the §3.A posture and it is cheap). */
const rawSchemaSchema = z.record(z.string(), z.unknown());

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
    .input(z.object({ sessionId: brandedId<RefinerySessionId>(), stage: refineryStageSchema, rewriteRunId: brandedId<RefineryRunId>().optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.runStage({ principal: ctx.auth, sessionId: input.sessionId, stage: input.stage, rewriteRunId: input.rewriteRunId }),
    ),

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
    .input(
      z.object({
        sessionId: brandedId<RefinerySessionId>(),
        accepts: z.array(acceptedFieldSchema).min(1),
        rewriteRunId: brandedId<RefineryRunId>().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.applyFields({ principal: ctx.auth, sessionId: input.sessionId, accepts: input.accepts, rewriteRunId: input.rewriteRunId }),
    ),

  applyAsCopy: authedProcedure
    .input(
      z.object({
        sessionId: brandedId<RefinerySessionId>(),
        accepts: z.array(acceptedFieldSchema).min(1),
        name: refinerySessionNameSchema.optional(),
        rewriteRunId: brandedId<RefineryRunId>().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.applyAsCopy({
        principal: ctx.auth,
        sessionId: input.sessionId,
        accepts: input.accepts,
        name: input.name,
        rewriteRunId: input.rewriteRunId,
      }),
    ),

  submitManualRewrite: authedProcedure
    .input(z.object({ sessionId: brandedId<RefinerySessionId>(), fields: z.array(refineryRewriteFieldSchema).min(1) }))
    .mutation(({ ctx, input }) => ctx.services.refinery.submitManualRewrite({ principal: ctx.auth, sessionId: input.sessionId, fields: input.fields })),

  preflight: authedProcedure
    .input(z.object({ sessionId: brandedId<RefinerySessionId>() }))
    .query(({ ctx, input }) => ctx.services.refinery.preflight({ principal: ctx.auth, sessionId: input.sessionId })),

  // ── the custom-schema library (R3/SF) ────────────────────────────────────────────────────────────────
  listSchemas: authedProcedure.query(({ ctx }) => ctx.services.refinery.listSchemas({ principal: ctx.auth })),

  createSchema: authedProcedure
    .input(z.object({ name: z.string(), description: z.string(), stage: refinerySchemaStageSchema, schema: rawSchemaSchema }))
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.createSchema({ principal: ctx.auth, name: input.name, description: input.description, stage: input.stage, schema: input.schema }),
    ),

  updateSchema: authedProcedure
    .input(
      z.object({
        schemaId: brandedId<RefinerySchemaId>(),
        patch: z.object({
          name: z.string().optional(),
          description: z.string().optional(),
          stage: refinerySchemaStageSchema.optional(),
          schema: rawSchemaSchema.optional(),
        }),
      }),
    )
    .mutation(({ ctx, input }) => ctx.services.refinery.updateSchema({ principal: ctx.auth, schemaId: input.schemaId, patch: input.patch })),

  deleteSchema: authedProcedure
    .input(z.object({ schemaId: brandedId<RefinerySchemaId>() }))
    .mutation(({ ctx, input }) => ctx.services.refinery.deleteSchema({ principal: ctx.auth, schemaId: input.schemaId })),

  generateSchema: authedProcedure
    .input(
      z.object({
        description: z.string().min(1).max(REFINERY_SCHEMA_DESCRIPTION_MAX),
        stage: refinerySchemaStageSchema,
        arm: refineryForgeArmSchema.optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.generateSchema({ principal: ctx.auth, description: input.description, stage: input.stage, arm: input.arm }),
    ),

  refineSchema: authedProcedure
    .input(z.object({ schema: rawSchemaSchema, instruction: refineryGuidanceSchema, stage: refinerySchemaStageSchema, arm: refineryForgeArmSchema.optional() }))
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.refineSchema({ principal: ctx.auth, schema: input.schema, instruction: input.instruction, stage: input.stage, arm: input.arm }),
    ),

  testSchema: authedProcedure
    .input(z.object({ schema: rawSchemaSchema, stage: refinerySchemaStageSchema, characterId: brandedId<CharacterId>() }))
    .mutation(({ ctx, input }) =>
      ctx.services.refinery.testSchema({ principal: ctx.auth, schema: input.schema, stage: input.stage, characterId: input.characterId }),
    ),
});
