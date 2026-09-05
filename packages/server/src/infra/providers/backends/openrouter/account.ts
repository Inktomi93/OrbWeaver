// infra/providers/backends/openrouter/account — the diagnostic account surfaces (credits + per-generation
// cost) the `credentials`/`account` domain verbs call THROUGH the providers diagnostic front door (injection).
// Family-agnostic, credential-shaped I/O adapters; they hold no state. Imports `backends/kit` DOWN; never a
// sibling backend.
//
// The result shapes now live in `@orb/contracts/providers` as the family-neutral `AccountCredits` /
// `GenerationCost` (the credentials/account domain consumes them through injection — cross-boundary, so they
// are homed in contracts, not file-local here). The activity / providers / endpoints diagnostics neo carried
// are FLAG[PD-80] (activity needs a management key; not in scope for this slice).

import type { AccountCredits, GenerationCost } from "@orb/contracts/providers";
import type { ProviderScrubSet } from "../../contract/index.ts";
import { providerErrorFromHttp } from "../kit/index.ts";

/** The slice of the SDK's `GetCreditsResponse` this port reads — narrowed so the real client satisfies it
 *  structurally and test fakes need no cast. */
interface OrCreditsResponse {
  readonly data: { readonly totalCredits: number; readonly totalUsage: number };
}

/** The slice of the SDK's `GenerationResponse` this port reads (token counts are null when the provider
 *  doesn't break them out — mirrors `generationCostSchema`). */
interface OrGenerationResponse {
  readonly data: {
    readonly totalCost: number;
    readonly tokensPrompt: number | null;
    readonly tokensCompletion: number | null;
  };
}

interface OrAccountClient {
  readonly credits: {
    readonly getCredits: (request?: undefined, options?: { readonly signal?: AbortSignal | undefined }) => Promise<OrCreditsResponse>;
  };
  readonly generations: {
    readonly getGeneration: (request: { readonly id: string }, options?: { readonly signal?: AbortSignal | undefined }) => Promise<OrGenerationResponse>;
  };
}

/** Read the credential's OpenRouter credit balance (`{ total, used }`). Works on any inference key.
 *  `secrets` is REQUIRED (#1599) and moved AHEAD of the optional `signal`: it used to default to `[]`, so
 *  this credential-bearing surface could classify a 401 with the by-value scrub silently off. */
export async function getOpenRouterCredits(client: Pick<OrAccountClient, "credits">, secrets: ProviderScrubSet, signal?: AbortSignal): Promise<AccountCredits> {
  let response: OrCreditsResponse;
  try {
    response = await client.credits.getCredits(undefined, signal !== undefined ? { signal } : undefined);
  } catch (err) {
    throw providerErrorFromHttp(err, "openrouter credits", secrets);
  }
  return { total: response.data.totalCredits, used: response.data.totalUsage };
}

/**
 * Read the upstream cost of ONE generation (settles a few seconds after the turn). MUST be called with the
 * key that billed the generation, else OpenRouter 404s — the caller throttles/retries; this just surfaces
 * the typed error. `secrets` is REQUIRED (#1599) and moved AHEAD of the optional `signal` — same reason as
 * {@link getOpenRouterCredits}.
 */
export async function getOpenRouterGenerationCost(
  client: Pick<OrAccountClient, "generations">,
  generationId: string,
  secrets: ProviderScrubSet,
  signal?: AbortSignal,
): Promise<GenerationCost> {
  let response: OrGenerationResponse;
  try {
    response = await client.generations.getGeneration({ id: generationId }, signal !== undefined ? { signal } : undefined);
  } catch (err) {
    throw providerErrorFromHttp(err, "openrouter generation", secrets);
  }
  return {
    totalCost: response.data.totalCost,
    tokensPrompt: response.data.tokensPrompt,
    tokensCompletion: response.data.tokensCompletion,
  };
}
