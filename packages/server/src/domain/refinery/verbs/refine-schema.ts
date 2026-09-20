// verb: refineSchema — ONE conversational iteration over the CURRENT draft ("add a severity enum").
// Convergence is verb-call-per-instruction (the structured-turn retry budget is fixed at one and is not a
// design knob — NL design §2.1); the engine lives in `substrate/schema-forge.ts`.
//
// The current schema rides the PROMPT as JSON, not as a typed input: the model answers in the forge's own
// leaf language (task #36), so an existing document — including one hand-authored at the raw door, outside
// the leaf language — is readable material without needing an inverse transpile.

import { REFINERY_FORGE_ARM_DEFAULT, refineryGuidanceSchema } from "@orb/contracts/refinery";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { resolveForgeCall, runForgeTurn } from "../substrate/schema-forge.ts";

export function createRefineSchema(ctx: RefineryContext): RefineryService["refineSchema"] {
  return async ({ principal, schema, instruction, stage, arm }) => {
    const ask = refineryGuidanceSchema.parse(instruction);
    const call = await resolveForgeCall(ctx, principal.userId);
    const userPrompt = `The schema as it stands today:\n${JSON.stringify(schema)}\n\nChange to make: ${ask}\n\nRe-describe the COMPLETE schema after that change — every field, not just the changed one.`;
    return runForgeTurn({
      stage,
      arm: arm ?? REFINERY_FORGE_ARM_DEFAULT,
      userPrompt,
      overrides: call.overrides,
      sampleOpts: call.sampleOpts,
      rc: call.rc,
    });
  };
}
