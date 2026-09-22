// verb: testSchema — a DRILL: one stage pass against an owned card under the DRAFT schema; returns the
// typed-per-schema payload for preview rendering. Writes NO run row, stamps NOTHING, touches no session.
// The ownership belt runs BEFORE any content verdict (the distill existence-oracle ordering), the draft
// runs the WHOLE document belt, and the card is untrusted content exactly as in every refinery run.

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import type { StructuredOptions } from "@orb/contracts/role-clients";
import { runStructuredTurn, StructuredOutputError } from "@orb/inference";
import { DomainNotFoundError } from "@orb/kit/errors";
import { liftJsonSchema, projectJsonSchema } from "@orb/kit/json-schema";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
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
    // `projectJsonSchema` is what CLOSES the object tree (`additionalProperties:false`) for the wire — the
    // stored/draft schema is open by construction (task #41; see `stage-resolution.ts`). A raw send would ship
    // open on the hosted wire; this projection is the enforcement, not a formality.
    const lifted = liftJsonSchema(doc.schema);
    const projected = projectJsonSchema(lifted);
    const [overrides, presetParams, rc] = await Promise.all([ctx.resolveUserProse(ownerId), ctx.resolveUserPresetParams(ownerId), ctx.roleClientsFor(ownerId)]);
    const posture = stage === "score" ? SIDE_GEN_POSTURES.refine_score : SIDE_GEN_POSTURES.refine_analyze;
    const sampleOpts: StructuredOptions = {
      responseFormat: { name: "refinery_schema_preview", schema: projected },
      ...resolveSideGenSampling(posture, presetParams),
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
      const res = await rc.structured([{ systemPrompt: prompts.system, userPrompt }], sampleOpts);
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
