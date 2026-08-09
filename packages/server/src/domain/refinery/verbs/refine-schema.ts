// verb: refineSchema — ONE conversational iteration over the CURRENT draft ("add a severity enum").
// Convergence is verb-call-per-instruction (the structured-turn retry budget is fixed at one and is not
// a design knob — NL design §2.1); the engine lives in `substrate/schema-forge.ts`.

import { refineryGuidanceSchema } from "@orb/contracts/refinery";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { resolveForgeCall, runForgeTurn } from "../substrate/schema-forge.ts";

export function createRefineSchema(ctx: RefineryContext): RefineryService["refineSchema"] {
  return async ({ principal, schema, instruction, stage }) => {
    const ask = refineryGuidanceSchema.parse(instruction);
    const call = await resolveForgeCall(ctx, principal.userId);
    const userPrompt = `Modify this schema:\n${JSON.stringify(schema)}\n\nInstruction: ${ask}\n\nReturn the COMPLETE modified schema in the same envelope.`;
    return runForgeTurn(ctx, { stage, userPrompt, overrides: call.overrides, sampleOpts: call.sampleOpts });
  };
}
