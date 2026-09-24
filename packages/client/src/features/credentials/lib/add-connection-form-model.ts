// The "Add a connection" dialog's form model (inference program §5.3a Essential tier: provider · key or URL
// · model). Client-only view shape + defaults + a plain-function validator for createSavedEntityForm. Values
// are transient (a create has no server row); the pasted key is minted into a credential row BEHIND the
// connection (its label copied from the connection's) and never read back. Floors mirror the domain's
// write-seam refusals as teaching; the verb stays the enforcement floor.

import type { ProviderAuth, ProviderDef, Wire } from "@orb/contracts/inference";
import { CONNECTION_OP_CODES, LOCAL_LIGHT_SEED_ROWS } from "@orb/contracts/inference";
import { clauseOf, MODEL_REQUIRED_MESSAGE } from "./model-picker-model.ts";

/** The command the Claude-subscription step asks the user to run (§5.3a: "a copyable `claude setup-token`"). */
export const CLAUDE_SETUP_TOKEN_COMMAND = "claude setup-token";

/** What the setup-token copy button names as its subject: `Copy <this>`. */
export const CLAUDE_SETUP_TOKEN_COPY_SUBJECT = `the command ${CLAUDE_SETUP_TOKEN_COMMAND}`;

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

/** Whether the dialog lists this draft's models on "List models": an endpoint under its URL, and a hosted
 *  provider under the API key pasted for it. A subscription token lists only once it is saved. */
export function listsOnDemand(provider: ProviderDef): boolean {
  return needsBaseUrl(provider) || provider.auth === "apiKey";
}

/** Why the dialog offers a typed model id before any list is read, per auth kind. A keyless draft lists as
 *  soon as its provider is picked, so its reason is only the list's own. */
const DRAFT_MODEL_REASONS: Record<ProviderAuth, (provider: ProviderDef) => string> = {
  endpoint: () => "Type the model id your server serves, or list them from the URL above.",
  apiKey: (provider) => `Paste your key and list the models it can use, or type the id as ${provider.label} spells it.`,
  oauthToken: (provider) => `Type the model id as ${provider.label} spells it.`,
  none: (provider) => `Pick one of the models ${provider.label} runs.`,
};

export function draftModelReason(provider: ProviderDef): string {
  return DRAFT_MODEL_REASONS[provider.auth](provider);
}

/** A model id in the provider's own spelling, for the typed field's placeholder. Keyed by the wire (and the
 *  OpenRouter dialect, whose ids carry a vendor prefix), because a provider is a data row, never a code
 *  entry; an endpoint row serves whatever its owner loaded, so it shows the shape of a hub id. */
const WIRE_MODEL_EXAMPLES: Record<Wire, string> = {
  "openai-compat": "gpt-5",
  "anthropic-messages": "claude-opus-5",
  "agent-sdk": "opus",
  // A builtin catalog is closed, so its example is a model it actually runs: the seeded encoder's id.
  "local-light": LOCAL_LIGHT_SEED_ROWS[0].model,
};

export function modelIdExample(provider: Pick<ProviderDef, "auth" | "dialect" | "wire">): string {
  if (provider.auth === "endpoint") {
    return "e.g. Qwen/Qwen3-32B";
  }
  return `e.g. ${provider.dialect === "openrouter" ? "anthropic/claude-opus-5" : WIRE_MODEL_EXAMPLES[provider.wire]}`;
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

/** The draft a model-list answer is ABOUT (#1502: a verdict must carry the inputs it was taken for, so an
 *  edited provider, URL or key retires it in the same commit). The provider is part of it because the list is
 *  read under that provider, and a saved key opens only under the provider it was saved for. */
export function draftKeyOf(draft: Pick<AddConnectionFormValues, "providerId" | "baseUrl" | "key">): string {
  return JSON.stringify([draft.providerId, draft.baseUrl.trim(), draft.key.trim()]);
}

/** Whether two drafts are the same, field for field — a failure statement stands only for the draft it failed. */
export function sameFormValues(a: AddConnectionFormValues, b: AddConnectionFormValues): boolean {
  return (Object.keys(a) as (keyof AddConnectionFormValues)[]).every((field) => a[field] === b[field]);
}

/** The refusals that are about the Server URL itself — they land on that field, where the fix is typed. */
export const URL_REFUSAL_CODES: ReadonlySet<string> = new Set([CONNECTION_OP_CODES.baseUrlInvalid, CONNECTION_OP_CODES.baseUrlRefused]);

/** The saved key as the dialog names it: the label the user gave it, or "unnamed" when they gave none. */
export function savedKeyName(label: string | null): string {
  return label === null ? "Key saved (unnamed)" : `Key saved as “${label}”`;
}

/** The one inline sentence for a failed submit. With a key minted it says the key IS saved (and as which
 *  Saved-keys row), the connection is NOT, and what the two exits do; with none, that nothing was saved. */
export function submitFailureSentence(args: { readonly heldKeyLabel: string | null | undefined; readonly reason: string }): string {
  const reason = clauseOf(args.reason);
  if (args.heldKeyLabel === undefined) {
    return `Nothing was saved — ${reason}.`;
  }
  const key = args.heldKeyLabel === null ? "Your key (unnamed) was saved in Saved keys" : `Your key was saved as “${args.heldKeyLabel}” in Saved keys`;
  return `${key}, but the connection wasn't created — ${reason}. Adding again reuses the saved key. If you cancel, the key stays in Saved keys.`;
}
