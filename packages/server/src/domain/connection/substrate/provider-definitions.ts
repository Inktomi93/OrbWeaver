// Pure canonical-definition helpers for the provider-row persistence door. Hashing and the claim comparison
// are substrate work; persistence files stay query-only.

import { createHash } from "node:crypto";
import type { ProviderDef, ProviderId } from "@orb/contracts/inference";

/** An owner's existing claim on a provider id: the definition that id is bound to for them. */
interface ClaimedDefinition {
  readonly id: ProviderId;
  readonly definitionHash: string;
}

/** Zod emits provider keys in schema order before this seam; array order remains part of the definition. */
export function providerDefinitionHash(row: ProviderDef): string {
  return createHash("sha256").update(JSON.stringify(row)).digest("hex");
}

/** The first desired id the owner already claimed with a different definition, or `undefined`. */
export function conflictingProviderDefinition(
  desired: readonly { readonly row: ProviderDef; readonly hash: string }[],
  claimed: readonly ClaimedDefinition[],
): ProviderId | undefined {
  const byId = new Map(claimed.map((claim) => [claim.id, claim.definitionHash]));
  return desired.find(({ row, hash }) => {
    const current = byId.get(row.id);
    return current !== undefined && current !== hash;
  })?.row.id;
}
