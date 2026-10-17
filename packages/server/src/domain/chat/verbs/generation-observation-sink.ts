import { batchHandle, databaseForOwner, databaseHandle } from "@orb/db/wiring-owner";
import type { GenerationObservationCallback } from "@orb/inference";
import { createChatContext } from "../context.ts";
import type { GenerationObservationAssemblyContext, GenerationObservationContext, GenerationObservationParent } from "../contract/generation-observation.ts";
import type { ChatAssemblyContext } from "../contract/wiring.ts";
import { createGenerationObservationSession } from "../persistence/generation-observation.ts";

/** Entry receives the paid-fact sink, never the private session's SQL assembly and commit methods. */
export function createGenerationObservationSink(
  input: GenerationObservationAssemblyContext,
  parent: GenerationObservationParent,
  target?: ChatAssemblyContext,
): GenerationObservationCallback {
  const ctx: GenerationObservationContext = {
    ...input,
    db: databaseForOwner(input.db),
    applyStatsDelta: (batch, db, delta) => input.applyStatsDelta(batchHandle(batch), databaseHandle(db), delta),
  };
  return createGenerationObservationSession(ctx, parent, target === undefined ? undefined : createChatContext(target)).onObservedResult;
}
