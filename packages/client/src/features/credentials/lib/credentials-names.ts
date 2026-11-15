// The words the connection editor, the add dialog and the saved-key rows print and a spec locates them by. A
// zero-import leaf, so a spec of another feature reads them without the component graph.

/** The Connections config group's label: its rail entry and its heading. */
export const CONNECTIONS_GROUP_LABEL = "Connections";

/** The Connections list's empty state. */
export const CONNECTIONS_EMPTY_TITLE = "No connections yet";

/** The Saved keys section's empty state. */
export const SAVED_KEYS_EMPTY_TITLE = "No keys yet";
export const SAVED_KEYS_EMPTY_DESCRIPTION = "A key is saved when you add a connection that needs one.";

/** The connection editor's own name field, which renames the connection. */
export const CONNECTION_NAME_FIELD_NAME = "Name";

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
/** The first-model step's choice to add the Utility model next, and the commit that opens that add. */
export const FIRST_MODEL_ADD_UTILITY_CHOICE = "Add a different model for it";
export const FIRST_MODEL_ADD_UTILITY_NAME = "Add a model";

/** The model picker's search box placeholder. */
export const MODEL_SEARCH_PLACEHOLDER = "Search models…";
/** The model picker's retry on a list read that failed. */
export const MODEL_LIST_RETRY_NAME = "Try the list again";
/** The model picker's label where it has no list to search, and its typed model id field. */
export const MODEL_FIELD_NAME = "Model";

/** The model picker's capability chips: the row badges and the filter toggles. */
export const MODEL_VISION_LABEL = "Vision";
export const MODEL_TOOLS_LABEL = "Tools";
/** A picker row's badge for a model whose list says it makes images and no text, so it serves no chat. */
export const MODEL_IMAGES_ONLY_LABEL = "Makes images";

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

/** A connection row's status badge while its key is revoked; the key's own row in Saved keys carries Replace. */
export const CONNECTION_KEY_REJECTED_BADGE = "Key rejected: replace it in Saved keys";

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

/** What failed to load, said by the account card's balance read. */
export const ACCOUNT_BALANCE_READ_LABEL = "the balance";

/** The connection facts a test reaches by name; each is the fact row's own name. */
export const FACT_NAMES = { summarizeConcurrency: "utility calls at once", contextWindow: "context window", maxOutput: "max output" } as const;

/** A count fact's line under its Override field. */
export const FACT_COUNT_HINT = "A number of tokens, like 128000, 128k or 1m. What you type here is what we believe about this server.";
/** A count fact's refusal for text that names no whole count above zero. */
export const FACT_COUNT_INVALID = "Type a whole number above zero, like 128000, 128,000, 128k or 1m.";

/** A fact row's controls, named for the fact: the override door, the typed value, its save and its reset. */
export function factOverrideName(fact: string): string {
  return `Override ${fact}`;
}
export function factYourValueName(fact: string): string {
  return `${fact}: your value`;
}
export function factSaveName(fact: string): string {
  return `Save your ${fact}`;
}
export function factResetName(fact: string): string {
  return `${FACT_RESET_VERB} ${fact}`;
}

/** The prompt-cache retention field's label, and its select, named for the connection it sets. */
export const PROMPT_CACHE_RETENTION_FIELD_LABEL = "Provider prefix retention";
export function promptCacheRetentionName(connection: string): string {
  return `${PROMPT_CACHE_RETENTION_FIELD_LABEL} on ${connection}`;
}

/** The add dialog's limits step, shown when a new connection's context window is a guess: its title, what it says, the
 *  field for each guessed limit (named as the Advanced rows name them), the image switch, and its two ways on. */
export const CONNECTION_LIMITS_TITLE = "How much can this model take?";
export const CONNECTION_LIMITS_DESCRIPTION = "This server doesn't say, so what follows is a guess. A window guessed too low cuts your chats short.";
// Where to find the real numbers, for a provider that keeps them somewhere other than the model's page: one line,
// keyed by provider id, that replaces the general where-to-look line.
// LiteRouter's list states no window for its plain models: the window there is the account's chat memory setting.
const LITEROUTER_PROVIDER_ID = "literouter";
const CONNECTION_LIMITS_WHERE_BY_PROVIDER: ReadonlyMap<string, string> = new Map([
  [
    LITEROUTER_PROVIDER_ID,
    "LiteRouter doesn't publish this model's limits. The context window is your account's chat memory setting in the LiteRouter dashboard.",
  ],
]);
/** What the limits mean and where to find them; `asksOutput` ⇒ the step also asks for the max output. */
export function connectionLimitsLead(asksOutput: boolean, providerId: string): readonly string[] {
  return [
    asksOutput
      ? "A chat that runs past the context window loses its oldest messages, and a reply stops at the max output."
      : "A chat that runs past the context window loses its oldest messages.",
    CONNECTION_LIMITS_WHERE_BY_PROVIDER.get(providerId) ??
      "A hosted provider lists these on the model's page. For a server you run yourself, use the context size you started it with.",
    "Numbers are in tokens; a token is about three quarters of a word. Leave a box empty to keep the guess. You can change these later under Advanced in this connection's settings.",
  ];
}
export const CONNECTION_LIMIT_FIELD_NAMES = { window: "Context window, in tokens", output: "Max output, in tokens" } as const;
export const CONNECTION_LIMITS_SAVE_NAME = "Save";
export const CONNECTION_LIMITS_KEEP_NAME = "Keep the guess";
/** What one limit field says about the value now in use; `guess` is that number as the field prints it. */
export function connectionLimitGuessLabel(guess: string): string {
  return `Our guess: ${guess}.`;
}
/** The one switch for image input, in the limits step and the connection editor. It states the same stored fact as the
 *  Advanced `takes` row, so its gloss says where the answer comes from in that row's own words. */
export const IMAGE_SWITCH_NAME = "Takes images";
export const IMAGE_SWITCH_ASSUMED_GLOSS =
  "Our guess: yes, because the server doesn't report what this model takes. Turn it off if the model can't read images.";
/** A hosted provider that reports nothing keeps images off until the user says the model reads them. */
export const IMAGE_SWITCH_ASSUMED_OFF_GLOSS =
  "Our guess: no, because the provider doesn't report what this model takes. Turn it on if the model can read images.";
export const IMAGE_SWITCH_STATED_GLOSS = "What this server and model report. Changing it tells us what to believe; it does not change what the server does.";
/** A set switch restates the answer it replaced, as the Advanced rows do. */
export function imageSwitchSetGloss(was: boolean): string {
  return `Your setting: it was ${was ? "yes" : "no"}.`;
}
/** What the limits step's read failure names as the thing that did not load. */
export const CONNECTION_LIMITS_READ_LABEL = "this connection's limits";
/** The limits step's line for a save the server refused; `reason` is the server's own words. */
export function connectionLimitsFailureLabel(reason: string): string {
  return `The limits weren't saved: ${reason}`;
}

/** The model field's notice when the provider refused the key the list was read under. */
export function keyRefusedNotice(listOwner: string): string {
  return `${listOwner} refused this key. Get a new key from your ${listOwner} account and paste it here.`;
}
/** A save refused because the provider refused the draft's key: a connection on it would fail its first turn. */
export const KEY_REFUSED_SAVE_REASON = "the provider refused this key. Paste a new key, then add the connection";
