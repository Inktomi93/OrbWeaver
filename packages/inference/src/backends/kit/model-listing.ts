// The ONE spelling of a model-list answer (`ModelListing`): a non-empty list is `listed`; an empty list and a
// failed dial are both `listed: false`, each with its own reason, so the pane can tell "the provider has no
// models" from "the provider did not answer". Also the one home of the bare catalog row every non-OpenRouter
// list yields (an id, maybe a display name and a window, nothing else). Shared by every backend's `listModels`
// and the runtime's catalog read.

import type { ModelCatalogEntry, ModelListing } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { ProviderScrubSet } from "../../contract/errors.ts";
import { redactSecretsFromText } from "./openai-body.ts";
import { sanitizeApiError } from "./sanitize.ts";

const NO_MODELS_LISTED = "the provider listed no models";

/** A catalog row from a list that carries only an id (plus, on some wires, a display name or a window):
 *  pricing, modalities and reasoning are unknown, never guessed. */
export function bareCatalogEntry(args: { readonly id: string; readonly name?: string | undefined; readonly contextLength?: number | null }): ModelCatalogEntry {
  return {
    id: args.id,
    name: args.name ?? args.id,
    contextLength: args.contextLength ?? null,
    promptPrice: null,
    completionPrice: null,
    cacheReadPrice: null,
    cacheWritePrice: null,
    inputModalities: [],
    outputModalities: [],
    supportedParameters: [],
    maxCompletionTokens: null,
    reasoning: null,
  };
}

export function listingOf(models: readonly ModelCatalogEntry[]): ModelListing {
  return models.length > 0 ? { listed: true, models: [...models] } : { listed: false, reason: NO_MODELS_LISTED };
}

/** A failed dial as the text a caller may see. The by-value scrub reads the intact text before
 *  `sanitizeApiError` can cut a secret in half (the #1809 order `fetch-json.ts` states), so a reflected key
 *  never reaches the pane. */
export function scrubbedReason(err: unknown, secrets: ProviderScrubSet): string {
  return sanitizeApiError(redactSecretsFromText(errorMessage(err), secrets));
}

export function failedListing(err: unknown, secrets: ProviderScrubSet): ModelListing {
  return { listed: false, reason: scrubbedReason(err, secrets) };
}
