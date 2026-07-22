// infra/providers/backends/openrouter/catalog — the LIVE OpenRouter `/models` fetch verb. An I/O adapter:
// `connection.refreshCatalog` calls it THROUGH injection and owns the snapshot + the in-memory TTL cache
// (this returns the parsed entries; it holds no cache). Normalizes the SDK's `Model[]` into the
// cross-boundary `ModelCatalogEntry[]` (the connection contract). Imports `backends/kit` DOWN; never a
// sibling backend.

import type { ModelsListResponse } from "@openrouter/sdk/models";
import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { providerErrorFromHttp } from "../kit";

// The structural slice this verb needs off the client port. `models.list()` is the public `/models`
// endpoint (no auth required) — connection may inject a keyless client.
interface OrCatalogClient {
  readonly models: {
    readonly list: () => Promise<ModelsListResponse>;
  };
}

// Parse an OpenRouter price string → number, or `null`. An EMPTY/blank string means "unpriced" (NOT free):
// `Number("")` is `0`, which would falsely report a free model, so blanks map to `null`. A non-numeric
// string also maps to `null`.
function toNumberOrNull(value: string | undefined): number | null {
  if (value === undefined || value.trim().length === 0) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Fetch + normalize the live OpenRouter model catalog. Maps each SDK `Model` into the cross-boundary
 * {@link ModelCatalogEntry}: pricing strings → numbers (blank → null, the unpriced signal), the input
 * modalities + supported parameters stringified. A transport/HTTP failure becomes a typed `ProviderError`.
 */
export async function fetchOrCatalog(client: OrCatalogClient): Promise<ModelCatalogEntry[]> {
  let response: ModelsListResponse;
  try {
    response = await client.models.list();
  } catch (err) {
    throw providerErrorFromHttp(err, "openrouter catalog");
  }
  return response.data.map((model) => ({
    id: model.id,
    name: model.name.length > 0 ? model.name : model.id,
    contextLength: model.contextLength,
    promptPrice: toNumberOrNull(model.pricing.prompt),
    completionPrice: toNumberOrNull(model.pricing.completion),
    cacheReadPrice: toNumberOrNull(model.pricing.inputCacheRead),
    cacheWritePrice: toNumberOrNull(model.pricing.inputCacheWrite),
    inputModalities: model.architecture.inputModalities.map(String),
    outputModalities: model.architecture.outputModalities.map(String),
    supportedParameters: model.supportedParameters.map(String),
    // The top provider's real output cap (null when OR doesn't advertise it — the resolver then estimates).
    maxCompletionTokens: model.topProvider.maxCompletionTokens ?? null,
    // Whether the top provider moderates content (R2) — surfaces as ModelCapability.moderated.
    isModerated: model.topProvider.isModerated,
    // OR's advertised per-model reasoning metadata (R0) — null for non-reasoning models (⇒ family fallback).
    reasoning: toReasoning(model.reasoning),
  }));
}

/** Normalize the SDK's `ModelReasoning` → the cross-boundary snapshot shape. `supportedEfforts` drops the
 *  wire's stray nulls (a `null` allowlist stays null = "no allowlist, all efforts accepted"). Returns null
 *  when OR omits reasoning (a non-reasoning or dynamic-router model). */
function toReasoning(reasoning: ModelsListResponse["data"][number]["reasoning"]): ModelCatalogEntry["reasoning"] {
  if (reasoning === undefined) {
    return null;
  }
  const efforts = reasoning.supportedEfforts;
  return {
    mandatory: reasoning.mandatory,
    ...(reasoning.defaultEnabled !== undefined ? { defaultEnabled: reasoning.defaultEnabled } : {}),
    supportedEfforts: efforts === null || efforts === undefined ? null : efforts.filter((effort) => effort !== null).map(String),
    ...(reasoning.defaultEffort !== undefined && reasoning.defaultEffort !== null ? { defaultEffort: String(reasoning.defaultEffort) } : {}),
    ...(reasoning.supportsMaxTokens !== undefined ? { supportsMaxTokens: reasoning.supportsMaxTokens } : {}),
  };
}
