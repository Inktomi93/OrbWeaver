// The "Add a provider key" dialog's form model. Client-only view shape + defaults + a plain-function
// validator for createSavedEntityForm. Values are transient (a create has no server row) and the secret
// is never read back. Floors mirror the credentials.add verb's guards as teaching, with the verb
// remaining the enforcement floor.

import type { SelectItems } from "@orb/ui/select";
import { ADD_KEY_PROVIDERS_ORDERED, PROVIDER_LABELS } from "./connections-model";

/** The add-a-key form's flat values (client-only view). */
export interface AddCredentialFormValues {
  readonly provider: string;
  readonly label: string;
  readonly key: string;
  readonly baseUrl: string;
  /** custom_openai only — an optional default model id. */
  readonly model: string;
}

/** Seed for every open — OpenRouter is the default provider. */
export const ADD_CREDENTIAL_DEFAULTS: AddCredentialFormValues = {
  provider: "openrouter",
  label: "",
  key: "",
  baseUrl: "",
  model: "",
};

/** The provider picker options — model-source providers only (`gif-search` is minted elsewhere). */
export const PROVIDER_ITEMS: SelectItems<string> = ADD_KEY_PROVIDERS_ORDERED.map((provider) => ({
  label: PROVIDER_LABELS[provider],
  value: provider,
}));

/** `true` when the picked provider is the custom OpenAI-compatible endpoint (needs a baseUrl). */
export function isCustomProvider(provider: string): boolean {
  return provider === "custom_openai";
}

/** The plain-function field validator: a non-empty key always, plus a baseUrl for custom_openai. */
export function validateAddCredential(
  value: AddCredentialFormValues,
): { fields: Record<string, string> } | undefined {
  const fields: Record<string, string> = {};
  if (value.key.trim().length === 0) {
    fields["key"] = "Paste your API key.";
  }
  if (isCustomProvider(value.provider) && value.baseUrl.trim().length === 0) {
    fields["baseUrl"] = "A base URL is required for a custom endpoint.";
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}
