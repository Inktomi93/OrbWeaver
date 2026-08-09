// domain/refinery/substrate/schema-forge — the NL→schema generation machinery the two forge verbs share
// (one verb per file; the engine lives here). The generation call is ITSELF structured: the validator is
// the §4.5 lift-refusal BRIDGE — a loose `{name, schema}` envelope whose superRefine runs the WHOLE
// document belt, so the bounded retry's correction prompt IS the belt's typed refusal naming construct +
// path. The extension's silent auto-fix becomes an honest ask-the-model-to-fix; a double failure RESOLVES
// as the `failed` arm carrying the raw last reply (show-the-partial, errors-as-data).
//
// VEHICLE: the domain's ruled F2 rung — `summarize` + ResponseFormat + the `schema_forge` posture (the
// same engine every stage runs; the NL doc's structured-role-first rec is recorded as a deviation in the
// build plan §7.4 — zero new compose machinery, one vehicle per domain).

import { SIDE_GEN_POSTURES } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import type { RefinerySchemaStage } from "@orb/contracts/refinery";
import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import type { SummarizeOptions } from "@orb/contracts/role-clients";
import type { UserId } from "@orb/kit/ids";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { resolveSideGenSampling } from "@orb/kit/side-gen-posture";
import { toSummarizeOptions } from "@orb/server/kit/side-gen-posture";
import { runStructuredTurn, StructuredOutputError } from "@orb/server/kit/structured-turn";
import { z } from "zod";
import type { RefineryContext } from "../context.ts";
import type { SchemaForgeResult } from "../contract/results.ts";
import { traceStructuredRetry } from "./structured-retry-trace.ts";

/** The `{{core}}` splice per stage — the well-known-core requirement, taught in the SAME words the save
 *  belt refuses in (so a generated draft passes the belt on the first try by construction). */
const CORE_TEXTS: Record<RefinerySchemaStage, string> = {
  score:
    '\n\nThis schema is for a SCORE stage. It MUST include a required "overallScore" property: {"type":"number","minimum":1,"maximum":10} — the card\'s score readout and the library sorts stay on that one scale.',
  analyze:
    '\n\nThis schema is for an ANALYZE stage. It MUST include a required "verdict" property: {"type":"string","enum":["ACCEPT","NEEDS_REFINEMENT","REGRESSION"]} — the iterate loop\'s stop condition.',
};

/** The generation call's own wire grammar: the loose envelope (the DRAFT's shape, not the draft's
 *  schema's shape — that one is only knowable after the model answers). */
const draftEnvelopeSchema = z.object({
  name: z.string(),
  schema: z.record(z.string(), z.unknown()),
});
const DRAFT_RESPONSE_FORMAT = { name: "refinery_schema_draft", schema: projectJsonSchema(draftEnvelopeSchema) };

/** The §4.5 bridge: the envelope + the WHOLE document belt as zod issues — what the bounded retry's
 *  correction quotes back at the model. Built per call (the stage closes over it). */
function forgeValidatorOf(stage: RefinerySchemaStage): z.ZodType<z.infer<typeof draftEnvelopeSchema>> {
  return draftEnvelopeSchema.superRefine((draft, ctx) => {
    const doc = refinerySchemaDocumentSchema.safeParse({ name: draft.name, description: "", stage, schema: draft.schema });
    if (!doc.success) {
      // A structural re-emit into the OUTER parse (the ISSUES_ALLOWLIST class): each belt issue rides to
      // the model's correction prompt with its path — the whole point of the bridge.
      for (const issue of doc.error.issues) {
        ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
      }
    }
  });
}

export async function resolveForgeCall(ctx: RefineryContext, ownerId: UserId): Promise<{ overrides: ProseOverrides; sampleOpts: SummarizeOptions }> {
  const [overrides, presetParams] = await Promise.all([ctx.resolveUserProse(ownerId), ctx.resolveUserPresetParams(ownerId)]);
  return {
    overrides,
    sampleOpts: { responseFormat: DRAFT_RESPONSE_FORMAT, ...toSummarizeOptions(resolveSideGenSampling(SIDE_GEN_POSTURES.schema_forge, presetParams)) },
  };
}

/** One forge turn: system = the schemaForge slot (+ the stage core splice), user = the caller's ask.
 *  Success → the `draft` arm; a double belt failure → the `failed` arm with the raw reply (header). */
export async function runForgeTurn(
  ctx: RefineryContext,
  args: { readonly stage: RefinerySchemaStage; readonly userPrompt: string; readonly overrides: ProseOverrides; readonly sampleOpts: SummarizeOptions },
): Promise<SchemaForgeResult> {
  const system = resolveProseText("refinery.schemaForge.system", args.overrides, { core: CORE_TEXTS[args.stage] });
  const run = async (correction?: string): Promise<string> => {
    const userPrompt = correction === undefined ? args.userPrompt : `${args.userPrompt}\n\n${correction}`;
    const res = await ctx.summarize([{ systemPrompt: system, userPrompt }], args.sampleOpts);
    return res.items[0]?.text ?? "";
  };
  try {
    const draft = await runStructuredTurn({ payloadSchema: forgeValidatorOf(args.stage), run, onRetry: traceStructuredRetry("refine-schema-forge") });
    return { kind: "draft", name: draft.name, schema: draft.schema };
  } catch (err) {
    if (err instanceof StructuredOutputError) {
      return { kind: "failed", message: "The model couldn't produce a schema that passes the checks — the raw draft is below for hand-fixing.", raw: err.raw };
    }
    throw err;
  }
}
