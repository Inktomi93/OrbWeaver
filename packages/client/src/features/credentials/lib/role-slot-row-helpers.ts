// Pure display helpers for RoleSlotRow, extracted under the component-size cap: the agent mirror's
// ghost label and the stale-stored-id advisory. Logic only — no React, no state.

import type { CredentialSource } from "@orb/contracts/credentials";
import { SOURCE_LABELS } from "./connections-model.ts";

/** The agent mirror's ghost text: the effective chat model, else "<source> default", else the app default. */
export function agentMirrorLabel(source: string, model: string): string {
  if (model !== "") {
    return model;
  }
  if (source !== "") {
    return `${SOURCE_LABELS[source as CredentialSource]} default`;
  }
  return "the app default";
}

/** The stale-stored-id amber advisory: a non-empty stored model not in the source's catalog. `null` when the id is present / free text is allowed / there's no catalog. */
export function staleIdWarning(
  value: string,
  result: { readonly models: readonly { readonly id: string }[]; readonly allowsFreeText: boolean } | undefined,
): string | null {
  if (value === "" || result === undefined || result.allowsFreeText || result.models.length === 0) {
    return null;
  }
  const present = result.models.some((entry) => entry.id === value);
  return present ? null : `“${value}” isn't in the catalog — it falls back to the default at run time.`;
}
