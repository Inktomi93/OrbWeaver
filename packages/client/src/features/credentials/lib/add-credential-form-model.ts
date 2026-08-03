// The "Add a provider key" dialog's form model. Client-only view shape + defaults + a plain-function
// validator for createSavedEntityForm. Values are transient (a create has no server row) and the secret
// is never read back. Floors mirror the credentials.add verb's guards as teaching, with the verb
// remaining the enforcement floor.

import type { CustomOpenAiResponseMap } from "@orb/contracts/credentials";
import type { SelectItems } from "@orb/ui/select";
import { ADD_KEY_PROVIDERS_ORDERED, PROVIDER_LABELS } from "./connections-model.ts";

/** The add-a-key form's flat values (client-only view). The three custom-endpoint transforms are edited as
 *  free text (JSON / a key list) and parsed on save; the server re-validates via `providerMetadataSchema`. */
export interface AddCredentialFormValues {
  readonly provider: string;
  readonly label: string;
  readonly key: string;
  readonly baseUrl: string;
  /** custom_openai only — an optional default model id. */
  readonly model: string;
  /** custom_openai only — extra request-body fields as a JSON object (merged over the base). */
  readonly includeBody: string;
  /** custom_openai only — request-body keys to strip, comma/newline-separated. */
  readonly excludeBody: string;
  /** custom_openai only — response dot-path overrides as a JSON object. */
  readonly responseMap: string;
}

/** Seed for every open — OpenRouter is the default provider. */
export const ADD_CREDENTIAL_DEFAULTS: AddCredentialFormValues = {
  provider: "openrouter",
  label: "",
  key: "",
  baseUrl: "",
  model: "",
  includeBody: "",
  excludeBody: "",
  responseMap: "",
};

// Splits a request-body exclude list on commas or newlines (hoisted per useTopLevelRegex).
const KEY_LIST_SEPARATOR_RE = /[\n,]/;

/** Parse a JSON-object text field to a plain object, or `null` when blank or not an object (the validator
 *  flags a non-blank invalid value before save is reached). */
export function parseJsonObject(text: string): Record<string, unknown> | null {
  const trimmed = text.trim();
  if (trimmed === "") {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Parse the JSON-object response-map text into the contract shape (server re-validates the dot-path fields). */
export function parseResponseMap(text: string): CustomOpenAiResponseMap | null {
  return parseJsonObject(text) as CustomOpenAiResponseMap | null;
}

/** Split a comma/newline-separated exclude list into trimmed, non-empty keys. */
export function parseKeyList(text: string): string[] {
  return text
    .split(KEY_LIST_SEPARATOR_RE)
    .map((key) => key.trim())
    .filter((key) => key.length > 0);
}

// True when the text is non-blank but is not a JSON object (a blank field is valid — it means "no transform").
function isInvalidJsonObject(text: string): boolean {
  return text.trim() !== "" && parseJsonObject(text) === null;
}

/** The provider picker options — every storable provider is user-addable. */
export const PROVIDER_ITEMS: SelectItems<string> = ADD_KEY_PROVIDERS_ORDERED.map((provider) => ({
  label: PROVIDER_LABELS[provider],
  value: provider,
}));

/** `true` when the picked provider is the custom OpenAI-compatible endpoint (needs a baseUrl). */
export function isCustomProvider(provider: string): boolean {
  return provider === "custom_openai";
}

/** The plain-function field validator: a non-empty key always, plus a baseUrl for custom_openai. */
export function validateAddCredential(value: AddCredentialFormValues): { fields: Record<string, string> } | undefined {
  const fields: Record<string, string> = {};
  if (value.key.trim().length === 0) {
    fields["key"] = "Paste your API key.";
  }
  if (isCustomProvider(value.provider)) {
    if (value.baseUrl.trim().length === 0) {
      fields["baseUrl"] = "A base URL is required for a custom endpoint.";
    }
    if (isInvalidJsonObject(value.includeBody)) {
      fields["includeBody"] = "Must be a JSON object of extra body fields.";
    }
    if (isInvalidJsonObject(value.responseMap)) {
      fields["responseMap"] = "Must be a JSON object of dot-paths.";
    }
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}
