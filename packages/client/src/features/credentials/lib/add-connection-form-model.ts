// The "Add a connection" dialog's form model (inference program §5.3a Essential tier: provider · key or URL
// · model). Client-only view shape + defaults + a plain-function validator for createSavedEntityForm. Values
// are transient (a create has no server row); the pasted key is minted into a credential row BEHIND the
// connection (its label copied from the connection's) and never read back. Floors mirror the domain's
// write-seam refusals as teaching; the verb stays the enforcement floor.

import type { ProviderAuth, ProviderDef } from "@orb/contracts/inference";
import { addModelActionLabel } from "./add-model-on-key-form-model.ts";
import { MODEL_REQUIRED_MESSAGE } from "./model-catalog-model.ts";

/** The command the Claude-subscription step asks the user to run (§5.3a: "a copyable `claude setup-token`"). */
export const CLAUDE_SETUP_TOKEN_COMMAND = "claude setup-token";

export interface AddConnectionFormValues {
  readonly providerId: string;
  /** DERIVED from the picked provider's row (`ProviderDef.auth`), written by the provider field's change
   *  listener — the validator runs at module scope with no registry in reach, so the auth kind rides the
   *  values. `""` until a provider is picked. */
  readonly auth: ProviderAuth | "";
  readonly label: string;
  /** Pasted inline for `apiKey` / `oauthToken` rows, optional for `endpoint` rows (the `--api-key` bearer).
   *  Emptied the moment the credential row is minted: from then on the dialog holds the row, not the secret. */
  readonly key: string;
  /** Set once THIS dialog minted the credential and the connection write then failed — the retry reuses the
   *  saved key, so the empty `key` is no longer a missing value. */
  readonly keyHeld: boolean;
  /** `endpoint` rows only. */
  readonly baseUrl: string;
  readonly model: string;
  /** `"auto"` unless the provider lists more than one api (`showsApiControl`). */
  readonly api: string;
  readonly allowBackground: boolean;
}

/** Seed for every open — no provider picked (F16: the picker is the only way anything gets set). */
export const ADD_CONNECTION_DEFAULTS: AddConnectionFormValues = {
  providerId: "",
  auth: "",
  label: "",
  key: "",
  keyHeld: false,
  baseUrl: "",
  model: "",
  api: "auto",
  allowBackground: false,
};

/** Whether the picked provider's rows carry a base URL (the "Your own server" group). */
export function needsBaseUrl(provider: ProviderDef | undefined): boolean {
  return provider?.auth === "endpoint";
}

/** Whether the picked provider's rows NEED a pasted secret (a key or a setup-token). */
export function needsKey(provider: ProviderDef | undefined): boolean {
  return provider?.auth === "apiKey" || provider?.auth === "oauthToken";
}

/** Whether a key MAY be pasted (endpoint rows take an optional bearer). */
export function acceptsKey(provider: ProviderDef | undefined): boolean {
  return needsKey(provider) || provider?.auth === "endpoint";
}

const KEYED_DRAFT_REASON = (provider: ProviderDef): string =>
  `Type the model id as ${provider.label} spells it. Once the connection is added, “${addModelActionLabel("key")}” in its menu lists the models the key can use.`;

/** Why the dialog offers a typed model id before any list is read, per auth kind. The add dialog has no
 *  catalog read for a hosted or built-in draft, so it names the saved-connection action that has one. */
const DRAFT_MODEL_REASONS: Record<ProviderAuth, (provider: ProviderDef) => string> = {
  endpoint: () => "Type the model id your server serves, or list them from the URL above.",
  apiKey: KEYED_DRAFT_REASON,
  oauthToken: KEYED_DRAFT_REASON,
  none: () => `Type the built-in model's id. Once the connection is added, “${addModelActionLabel("builtin")}” in its menu lists the built-in models.`,
};

export function draftModelReason(provider: ProviderDef): string {
  return DRAFT_MODEL_REASONS[provider.auth](provider);
}

/** The plain-function field validator — provider picked, secret present where the auth kind needs one, a
 *  URL on an endpoint row, and a model (never defaulted). Reads the DERIVED `auth` value, never a registry. */
export function validateAddConnection(value: AddConnectionFormValues): { fields: Record<string, string> } | undefined {
  const fields: Record<string, string> = {};
  if (value.providerId === "" || value.auth === "") {
    fields["providerId"] = "Pick a provider.";
  }
  if ((value.auth === "apiKey" || value.auth === "oauthToken") && !value.keyHeld && value.key.trim() === "") {
    fields["key"] = value.auth === "oauthToken" ? `Paste the token from \`${CLAUDE_SETUP_TOKEN_COMMAND}\`.` : "Paste your API key.";
  }
  if (value.auth === "endpoint" && value.baseUrl.trim() === "") {
    fields["baseUrl"] = "Your server's base URL is required.";
  }
  if (value.model.trim() === "") {
    fields["model"] = MODEL_REQUIRED_MESSAGE;
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}

/** The copy every connection-writing form shares, so the add dialog and the saved-key dialog name the same
 *  fields and the same switch the same way. */
export const CONNECTION_FORM_COPY = {
  labelHint: "Optional — defaults to “provider · model”.",
  backgroundLabel: "Allow background work",
  backgroundDescription: "Let summaries, captions and memory digests run on this connection unattended.",
  submit: "Add connection",
  submitFailed: "Couldn't submit the connection.",
} as const;
