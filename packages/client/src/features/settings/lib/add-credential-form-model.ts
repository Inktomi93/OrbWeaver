// The "Add a provider key" dialog's form MODEL (Settings → Connections → Saved keys). The client-only
// view shape + defaults + the plain-function validator for `createSavedEntityForm` (D54 §13.4 — a ≥3-field
// form is a factory, never hand-rolled controlled state). The values are transient (a CREATE has no server
// row; every open seeds `defaultValues`) and the secret is NEVER read back — see add-credential-dialog.tsx.
//
// Validation is plain-function `onDynamic` (revalidateLogic: validate on submit, then live) — the client
// has no zod dep. The floors MIRROR the `credentials.add` verb's guards (a non-empty key; a baseUrl for
// custom_openai — the endpoint IS the selection) as teaching, with the verb remaining the enforcement floor.

import type { SelectItems } from "@orb/ui/select";
import { ADD_KEY_PROVIDERS_ORDERED, PROVIDER_LABELS } from "./connections-model";

/** The add-a-key form's flat values (client-only view). `provider` is a `CredentialProvider` member kept
 *  as a string for the bound `SelectField` (string-valued by design); `label`/`baseUrl` are optional
 *  (empty = omitted at save), `key` is the required secret. */
export interface AddCredentialFormValues {
  readonly provider: string;
  readonly label: string;
  readonly key: string;
  readonly baseUrl: string;
  /** custom_openai only — an optional default model id (persisted into `metadata.model`; GAP-6). */
  readonly model: string;
}

/** Seed for every open (a CREATE has no server row) — OpenRouter is the default provider. */
export const ADD_CREDENTIAL_DEFAULTS: AddCredentialFormValues = {
  provider: "openrouter",
  label: "",
  key: "",
  baseUrl: "",
  model: "",
};

/** The provider picker options (label + value), one home derived from `connections-model`. Model-source
 *  providers only — `gif-search` keys are minted by the GIF search feature, not this dialog. */
export const PROVIDER_ITEMS: SelectItems<string> = ADD_KEY_PROVIDERS_ORDERED.map((provider) => ({
  label: PROVIDER_LABELS[provider],
  value: provider,
}));

/** `true` when the picked provider is the custom OpenAI-compatible endpoint (needs a baseUrl). */
export function isCustomProvider(provider: string): boolean {
  return provider === "custom_openai";
}

/** The plain-function field validator: a non-empty key always, plus a baseUrl for custom_openai. Returns
 *  `{ fields }` (the `onDynamic` shape) or `undefined` when clean — gates the factory's `canSubmit`. */
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
