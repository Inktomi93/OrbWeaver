// verb: testSchema — a DRILL: one stage pass against an owned card under the DRAFT schema; returns the
// typed-per-schema payload for preview rendering. Writes NO run row, stamps NOTHING, touches no session.
// The ownership belt runs BEFORE any content verdict (the distill existence-oracle ordering), the draft
// runs the WHOLE document belt, and the card is untrusted content exactly as in every refinery run.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import type { SummarizeOptions } from "@orb/contracts/role-clients";
import { DomainNotFoundError } from "@orb/kit/errors";
import { liftJsonSchema, projectJsonSchema } from "@orb/kit/json-schema";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { runStructuredTurn, StructuredOutputError } from "@orb/server/kit/structured-turn";
import type { RefineryContext } from "../context.ts";
import { RefineryRunFailedError } from "../contract/errors.ts";
import type { RefineryService } from "../contract/service.ts";
import { buildAnalyzePrompt, buildScorePrompt, customShapeTextOf } from "../substrate/refine-prompt.ts";
import { buildStageParse } from "../substrate/stage-parse.ts";
import { traceStructuredRetry } from "../substrate/structured-retry-trace.ts";

export function createTestSchema(ctx: RefineryContext): RefineryService["testSchema"] {
  return async ({ principal, schema, stage, characterId }) => {
    const ownerId = principal.userId;
    // Ownership belt FIRST (existence-oracle ordering) — then the draft belt, then the drill.
    const card = await ctx.loadOwnedCard({ ownerId, characterId });
    if (card === undefined) {
      throw new DomainNotFoundError("character", characterId);
    }
    const doc = refinerySchemaDocumentSchema.parse({ name: "draft_preview", description: "", stage, schema });
    const lifted = liftJsonSchema(doc.schema);
    const projected = projectJsonSchema(lifted);
    const [overrides, presetParams] = await Promise.all([ctx.resolveUserProse(ownerId), ctx.resolveUserPresetParams(ownerId)]);
    const posture = stage === "score" ? SIDE_GEN_POSTURES.refine_score : SIDE_GEN_POSTURES.refine_analyze;
    const sampleOpts: SummarizeOptions = {
      responseFormat: { name: "refinery_schema_preview", schema: projected },
      ...toSummarizeOptions(resolveSideGenSampling(posture, presetParams)),
    };
    // The drill prompt: the whole card's populated core in scope (a preview wants the full treatment),
    // the draft's own shape spliced, no guidance. An analyze drill has no rewrite to judge — it reads the
    // card as both sides' baseline, which is honest for a schema PREVIEW (the shape is under test).
    const selection = { fields: [...(["description", "personality", "scenario", "greetings", "exampleMessages"] as const)] };
    const prompts =
      stage === "score"
        ? buildScorePrompt({
            card,
            selection,
            mode: null,
            guidance: null,
            overrides,
            customInstruction: doc.description,
            shapeText: customShapeTextOf(projected),
          })
        : buildAnalyzePrompt({
            originalCard: card,
            selection,
            mode: null,
            guidance: null,
            overrides,
            rewrite: { fields: [] },
            customInstruction: doc.description,
            shapeText: customShapeTextOf(projected),
          });
    const parse = buildStageParse(lifted);
    const run = async (correction?: string): Promise<string> => {
      const userPrompt = correction === undefined ? prompts.user : `${prompts.user}\n\n${correction}`;
      const res = await ctx.summarize([{ systemPrompt: prompts.system, userPrompt }], sampleOpts);
      return res.items[0]?.text ?? "";
    };
    try {
      const payload = await runStructuredTurn({ payloadSchema: parse.schema, run, onRetry: traceStructuredRetry("refine-schema-test") });
      return payload as Record<string, unknown>;
    } catch (err) {
      if (err instanceof StructuredOutputError) {
        throw new RefineryRunFailedError("The test run returned nothing usable under that schema. Try again or adjust the schema.", { cause: err });
      }
      throw err;
    }
  };
}
