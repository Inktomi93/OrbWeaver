// The "Add a connection" dialog's form model (inference program §5.3a Essential tier: provider · key or URL
// · model). Client-only view shape + defaults + a plain-function validator for createSavedEntityForm. Values
// are transient (a create has no server row); the pasted key is minted into a credential row BEHIND the
// connection (its label copied from the connection's) and never read back. Floors mirror the domain's
// write-seam refusals as teaching; the verb stays the enforcement floor.

import type { ProviderAuth, ProviderDef } from "@orb/contracts/inference";

export interface AddConnectionFormValues {
  readonly providerId: string;
  /** DERIVED from the picked provider's row (`ProviderDef.auth`), written by the provider field's change
   *  listener — the validator runs at module scope with no registry in reach, so the auth kind rides the
   *  values. `""` until a provider is picked. */
  readonly auth: ProviderAuth | "";
  readonly label: string;
  /** Pasted inline for `apiKey` / `oauthToken` rows, optional for `endpoint` rows (the `--api-key` bearer). */
  readonly key: string;
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

/** The plain-function field validator — provider picked, secret present where the auth kind needs one, a
 *  URL on an endpoint row, and a model (never defaulted). Reads the DERIVED `auth` value, never a registry. */
export function validateAddConnection(value: AddConnectionFormValues): { fields: Record<string, string> } | undefined {
  const fields: Record<string, string> = {};
  if (value.providerId === "" || value.auth === "") {
    fields["providerId"] = "Pick a provider.";
  }
  if ((value.auth === "apiKey" || value.auth === "oauthToken") && value.key.trim() === "") {
    fields["key"] = value.auth === "oauthToken" ? "Paste the token from `claude setup-token`." : "Paste your API key.";
  }
  if (value.auth === "endpoint" && value.baseUrl.trim() === "") {
    fields["baseUrl"] = "Your server's base URL is required.";
  }
  if (value.model.trim() === "") {
    fields["model"] = "Pick a model or type its id.";
  }
  return Object.keys(fields).length > 0 ? { fields } : undefined;
}
