// Pure canonical-definition helpers for the provider-row persistence door. Hashing and in-memory indexes
// are substrate work; persistence files stay query-only.

import { createHash } from "node:crypto";
import type { ProviderDef, ProviderId } from "@orb/contracts/inference";

interface ExistingProviderDefinition {
  readonly id: ProviderId;
  readonly definitionHash: string;
  readonly originKind: "plugin" | "admin";
}

/** Zod emits provider keys in schema order before this seam; array order remains part of the definition. */
export function providerDefinitionHash(row: ProviderDef): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

export function indexProviderDefinitions<T extends { readonly id: ProviderId }>(rows: readonly T[]): ReadonlyMap<ProviderId, T> {
  return new Map(rows.map((row) => [row.id, row]));
}

export function conflictingProviderDefinition(
  desired: readonly { readonly row: ProviderDef; readonly hash: string }[],
  existing: readonly ExistingProviderDefinition[],
): ProviderId | undefined {
  let conflict: ProviderId | undefined;
  const byId = indexProviderDefinitions(existing);
  for (const desiredRow of desired) {
    const current = byId.get(desiredRow.row.id);
    if (current === undefined) {
      continue;
    }
    if (current.originKind === "admin" || current.definitionHash !== desiredRow.hash) {
      conflict = desiredRow.row.id;
      break;
    }
  }
  return conflict;
}
