// verb: getGenerationCost — the settled upstream cost of ONE OpenRouter generation (lands a few seconds
// after the turn; MUST be read with the key that billed it, so the caller's own `openrouter` credential is
// resolved first — a missing/revoked key rejects with `DomainNoCredentialError` before any upstream call).
// The retry/throttle policy on a not-yet-settled 404 is the CALLER's (the infra adapter surfaces the typed
// error verbatim); connection adds no reshaping.

import type { GenerationCost } from "@orb/contracts/providers";
import type { ConnectionContext } from "../context";
import type { GetGenerationCostParams } from "../contract/params";
import type { ConnectionService } from "../contract/service";

export function createGetGenerationCost(ctx: ConnectionContext): ConnectionService["getGenerationCost"] {
  return async ({ principal, generationId, signal }: GetGenerationCostParams): Promise<GenerationCost> => {
    const credential = await ctx.resolveCredential({ principal, source: "openrouter" });
    return await ctx.generationCost({ credential, generationId, signal });
  };
}
