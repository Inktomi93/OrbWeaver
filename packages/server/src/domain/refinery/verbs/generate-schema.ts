// verb: generateSchema — NL → a DRAFT schema document (never persisted; the client holds the draft). The
// engine, the three authoring arms and the errors-as-data outcomes live in `substrate/schema-forge.ts`; the
// NL description is the OWNER's own prompt input (the guidance trust tier) and is bounded like it.

import { REFINERY_FORGE_ARM_DEFAULT, REFINERY_SCHEMA_DESCRIPTION_MAX } from "@orb/contracts/refinery";
import { z } from "zod";
import type { RefineryContext } from "../context.ts";
import type { RefineryService } from "../contract/service.ts";
import { resolveForgeCall, runForgeTurn } from "../substrate/schema-forge.ts";

const askSchema = z.string().min(1).max(REFINERY_SCHEMA_DESCRIPTION_MAX);

export function createGenerateSchema(ctx: RefineryContext): RefineryService["generateSchema"] {
  return async ({ principal, description, stage, arm }) => {
    const ask = askSchema.parse(description);
    const call = await resolveForgeCall(ctx, principal.userId);
    return runForgeTurn(ctx, {
      stage,
      arm: arm ?? REFINERY_FORGE_ARM_DEFAULT,
      userPrompt: `Describe-to-schema request:\n${ask}`,
      overrides: call.overrides,
      sampleOpts: call.sampleOpts,
    });
  };
}
