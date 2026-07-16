// infra/providers/backends/openrouter/account — the diagnostic account surfaces (credits + per-generation
// cost) the `credentials`/`account` domain verbs call THROUGH the providers diagnostic front door (injection).
// Family-agnostic, credential-shaped I/O adapters; they hold no state. Imports `backends/kit` DOWN; never a
// sibling backend.
//
// The result shapes now live in `@orb/contracts/providers` as the family-neutral `AccountCredits` /
// `GenerationCost` (the credentials/account domain consumes them through injection — cross-boundary, so they
// are homed in contracts, not file-local here). The activity / providers / endpoints diagnostics neo carried
// are FLAG[PD-80] (activity needs a management key; not in scope for this slice).

import type { GenerationResponse } from "@openrouter/sdk/models";
import type { GetCreditsResponse } from "@openrouter/sdk/models/operations";
import type { AccountCredits, GenerationCost } from "@orb/contracts/providers";
import { providerErrorFromHttp } from "../kit";

interface OrAccountClient {
  readonly credits: {
    readonly getCredits: () => Promise<GetCreditsResponse>;
  };
  readonly generations: {
    readonly getGeneration: (request: { readonly id: string }) => Promise<GenerationResponse>;
  };
}

/** Read the credential's OpenRouter credit balance (`{ total, used }`). Works on any inference key. */
export async function getOpenRouterCredits(client: Pick<OrAccountClient, "credits">): Promise<AccountCredits> {
  let response: GetCreditsResponse;
  try {
    response = await client.credits.getCredits();
  } catch (err) {
    throw providerErrorFromHttp(err, "openrouter credits");
  }
  return { total: response.data.totalCredits, used: response.data.totalUsage };
}

/**
 * Read the upstream cost of ONE generation (settles a few seconds after the turn). MUST be called with the
 * key that billed the generation, else OpenRouter 404s — the caller throttles/retries; this just surfaces
 * the typed error.
 */
export async function getOpenRouterGenerationCost(client: Pick<OrAccountClient, "generations">, generationId: string): Promise<GenerationCost> {
  let response: GenerationResponse;
  try {
    response = await client.generations.getGeneration({ id: generationId });
  } catch (err) {
    throw providerErrorFromHttp(err, "openrouter generation");
  }
  return {
    totalCost: response.data.totalCost,
    tokensPrompt: response.data.tokensPrompt,
    tokensCompletion: response.data.tokensCompletion,
  };
}
