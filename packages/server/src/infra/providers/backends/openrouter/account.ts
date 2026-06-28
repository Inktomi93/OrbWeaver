// infra/providers/backends/openrouter/account — the diagnostic account surfaces (credits + per-generation
// cost) the `credentials`/`account` domain verbs call THROUGH injection. Family-agnostic, credential-shaped
// I/O adapters; they hold no state. Imports `backends/kit` DOWN; never a sibling backend.
//
// FLAG (orchestrator): these result shapes (`OrCreditsSnapshot`, `OrGenerationCost`) are cross-boundary
// (the credentials/account domain consumes them via injection) but have NO `@orb/contracts` home yet — they
// live here as file-local interfaces because the `no-inline-types` gate forbids a backend EXPORTING a type
// alias. When the account verb lands, these need a contract home (e.g. `@orb/contracts/credentials` or a
// new account node). The activity / providers / endpoints diagnostics neo carried are DEFERRED (activity
// needs a management key; not in scope for this slice).

import type { GenerationResponse } from "@openrouter/sdk/models";
import type { GetCreditsResponse } from "@openrouter/sdk/models/operations";
import { providerErrorFromHttp } from "../kit";

// File-local cross-boundary shapes — see the header FLAG (no contract home yet).
interface OrCreditsSnapshot {
  readonly total: number;
  readonly used: number;
}
interface OrGenerationCost {
  readonly totalCost: number;
  readonly tokensPrompt: number | null;
  readonly tokensCompletion: number | null;
}

interface OrAccountClient {
  readonly credits: {
    readonly getCredits: () => Promise<GetCreditsResponse>;
  };
  readonly generations: {
    readonly getGeneration: (request: { readonly id: string }) => Promise<GenerationResponse>;
  };
}

/** Read the credential's OpenRouter credit balance (`{ total, used }`). Works on any inference key. */
export async function getOpenRouterCredits(
  client: Pick<OrAccountClient, "credits">,
): Promise<OrCreditsSnapshot> {
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
export async function getOpenRouterGenerationCost(
  client: Pick<OrAccountClient, "generations">,
  generationId: string,
): Promise<OrGenerationCost> {
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
