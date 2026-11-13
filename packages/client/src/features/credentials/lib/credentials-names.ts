// The words the connection editor, the add dialog and the saved-key rows print and a spec locates them by. A
// zero-import leaf, so a spec of another feature reads them without the component graph.

/** The Connections config group's label: its rail entry and its heading. */
export const CONNECTIONS_GROUP_LABEL = "Connections";

/** The Connections list's empty state. */
export const CONNECTIONS_EMPTY_TITLE = "No connections yet";

/** The Saved keys section's empty state. */
export const SAVED_KEYS_EMPTY_TITLE = "No keys yet";
export const SAVED_KEYS_EMPTY_DESCRIPTION = "A key is saved when you add a connection that needs one.";

/** The connection editor header's back button. */
export const BACK_TO_CONNECTIONS_NAME = "Back to Connections";

/** The key field, in the add dialog and in the connection editor's Essential tier. */
export const API_KEY_FIELD_NAME = "API key";

/** The key field where a bearer is optional, as on an endpoint row. */
export const API_KEY_OPTIONAL_FIELD_NAME = `${API_KEY_FIELD_NAME} (optional)`;
/** The key field of a provider signed in by setup token. */
export const SETUP_TOKEN_FIELD_NAME = "Setup token";

/** The add dialog's button that reads a draft's model list. */
export const LIST_MODELS_NAME = "List models";

/** The first-model step's commit button. */
export const FIRST_MODEL_FINISH_NAME = "Finish";

/** The model picker's search box placeholder. */
export const MODEL_SEARCH_PLACEHOLDER = "Search models…";

/** The model picker's capability chips: the row badges and the filter toggles. */
export const MODEL_VISION_LABEL = "Vision";
export const MODEL_TOOLS_LABEL = "Tools";

/** A picker row's badge for a model the key already has a connection for. */
export const MODEL_ALREADY_ADDED_LABEL = "Already added";

/** A picker row's badge for the model the form holds. */
export const MODEL_SELECTED_LABEL = "Selected";

/** The connection editor's disclosure tiers. A tier's trigger also carries its count badge and kicker. */
export const CONNECTION_EDITOR_TIER_TITLES = {
  essential: "Essential",
  purpose: "Purpose",
  promptCache: "Prompt caching",
  advanced: "Advanced",
  diagnostics: "Diagnostics",
} as const;

/** The Advanced tier's `features` block heading. */
export const ENDPOINT_QUIRKS_LABEL = "Endpoint quirks";

/** The verb on a fact row's reset button and its confirm. */
export const FACT_RESET_VERB = "Reset";

/** The embedding fact leaf an output-size refusal names. */
export const VECTOR_WIDTH_FACT_NAME = "vector width";

/** A typed fact value under its leaf's minimum; `reads` is the minimum as the row prints it. */
export function factMinimumLabel(reads: string): string {
  return `The minimum is ${reads}.`;
}

/** A typed fact value over its leaf's maximum; `reads` is the maximum as the row prints it. */
export function factMaximumLabel(reads: string): string {
  return `The maximum is ${reads}.`;
}

/** The Diagnostics tier's credit balance block. */
export const ACCOUNT_CREDITS_LABEL = "Account credits";
export const ACCOUNT_CREDITS_READING = "Reading the balance…";

/** The Prompt caching tier's history depth field. */
export const PROMPT_CACHE_DEPTH_NAME = "History cache depth";

/** The Prompt caching tier's provider retention choices. */
export const PROMPT_CACHE_RETENTION_INHERIT_LABEL = "Inherit provider default";
export const PROMPT_CACHE_RETENTION_24H_LABEL = "Up to 24 hours";
export const PROMPT_CACHE_RETENTION_IN_MEMORY_LABEL = "In memory";

/** The Prompt caching tier's statement of provider-managed implicit caching, by documented support. */
export const PROMPT_CACHE_IMPLICIT_GLOSS = {
  supported: "Provider-managed implicit prefix caching is available; eligibility and hits are determined upstream.",
  unsupported: "Provider-managed implicit prefix caching is not documented as automatic on this route.",
  unknown: "Provider-managed implicit prefix cache support is unknown for this route.",
} as const;

/** The lead of the Prompt caching tier's line naming the app's own prefix request. */
export const PROMPT_CACHE_PREFIX_REQUEST_LEAD = "App prefix request:";

/** A revoked saved key's button and confirm that lift the flag. */
export const CLEAR_REVOKED_NAME = "Clear revoked";

/** The verb on a saved key's revoke button and its confirm. */
export const KEY_REVOKE_VERB = "Revoke";

/** A saved key's subtitle cause when the user revoked it. */
export const KEY_REVOKED_BY_YOU = "Revoked by you";

/** The row's identity as every one of its actions names it: `OpenRouter "work"`, feeding
 *  `Replace the <provider> "<label>" key` / `Revoke the <provider> "<label>" key` verbatim. ONE spelling —
 *  a title in a second form would put the visible label and the accessible name out of agreement, which is
 *  WCAG 2.5.3's whole subject, and in a list of keys a bare verb or a bare label names nothing. */
export function keySubjectName(providerLabel: string, label: string): string {
  return `${providerLabel} "${label}"`;
}

/** The add-another-model action's name, by what the new connection shares with the row it was opened from. */
export const ADD_MODEL_ACTION_LABELS = {
  key: "Add another model on this key",
  server: "Add another model on this server",
  builtin: "Add another built-in model",
} as const;

/** A saved key's replace button and the replace prompt's title; `subject` is the key as its row names it. */
export function replaceKeyName(subject: string): string {
  return `Replace the ${subject} key`;
}

/** A saved key's revoke button. */
export function revokeKeyName(subject: string): string {
  return `Revoke the ${subject} key`;
}

/** The revoke confirm's title. */
export function revokeKeyTitle(subject: string): string {
  return `${revokeKeyName(subject)}?`;
}

/** A revoked saved key's remove button. */
export function removeKeyName(subject: string): string {
  return `Remove the ${subject} key`;
}

/** The remove confirm's title. */
export function removeKeyTitle(subject: string): string {
  return `${removeKeyName(subject)}?`;
}
