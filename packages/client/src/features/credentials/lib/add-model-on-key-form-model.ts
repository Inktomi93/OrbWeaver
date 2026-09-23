// "Add another model on this key" (inference program §5.3a, the second no-defaults survivability action; drawn
// on the connections list mock, Board B). A saved connection's row menu opens a dialog that
// pre-fills provider + credential (+ server URL and transport for an endpoint row) from the row and lands on
// the model picker, whose catalog is the SAVED row's (`connection.catalogModels`), because the new row shares
// its key. This file holds the action's copy, which rows offer it, and the dialog's form values.

import type { ProviderAuth } from "@orb/contracts/inference";
import { MODEL_REQUIRED_MESSAGE } from "./model-picker-model.ts";

/** What the new connection shares with the row it was opened from. The row's own key is the §5.3a case; an
 *  endpoint row with no key shares its server, and a built-in row shares nothing but the provider. */
const ADD_MODEL_ACTION_COPY = {
  key: {
    label: "Add another model on this key",
    gloss: (provider: string): string => `A new connection on ${provider} with the same key — you only pick the model.`,
  },
  server: {
    label: "Add another model on this server",
    gloss: (provider: string): string => `A new connection on ${provider} at the same address — you only pick the model.`,
  },
  builtin: {
    label: "Add another built-in model",
    gloss: (provider: string): string => `A new connection on ${provider} — you only pick the model.`,
  },
} as const;

/** Not exported (`no-inline-types`): readers derive it as `NonNullable<ReturnType<typeof addModelScope>>`. */
type AddModelScope = keyof typeof ADD_MODEL_ACTION_COPY;

/** The row's scope, or `null` when the action cannot work: a hosted row whose key is gone has nothing to
 *  list a catalog with and nothing to share. */
export function addModelScope(row: { readonly auth: ProviderAuth; readonly credentialId: string | null }): AddModelScope | null {
  switch (row.auth) {
    case "none":
      return "builtin";
    case "endpoint":
      return row.credentialId === null ? "server" : "key";
    case "apiKey":
    case "oauthToken":
      return row.credentialId === null ? null : "key";
  }
}

export function addModelActionLabel(scope: AddModelScope): string {
  return ADD_MODEL_ACTION_COPY[scope].label;
}

export function addModelActionGloss(scope: AddModelScope, providerLabel: string): string {
  return ADD_MODEL_ACTION_COPY[scope].gloss(providerLabel);
}

export interface AddModelOnKeyFormValues {
  readonly model: string;
  readonly label: string;
  readonly allowBackground: boolean;
}

/** Background work is off until the user turns it on for THIS connection, as in the add dialog. */
export const ADD_MODEL_ON_KEY_DEFAULTS: AddModelOnKeyFormValues = { model: "", label: "", allowBackground: false };

export function validateAddModelOnKey(value: AddModelOnKeyFormValues): { fields: Record<string, string> } | undefined {
  return value.model.trim() === "" ? { fields: { model: MODEL_REQUIRED_MESSAGE } } : undefined;
}
