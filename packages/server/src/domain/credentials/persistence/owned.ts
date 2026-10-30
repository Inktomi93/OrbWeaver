// Ownership is proven by the credentials producer before a binding may refer to its row.

import type { CredentialOwned } from "@orb/contracts/inference";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { fetchOwnedCredential } from "./queries.ts";

export function createCredentialOwned(handle: DatabaseHandle): CredentialOwned {
  const db = databaseForOwner(handle);
  return async (ownerId, credentialId): Promise<boolean> => (await fetchOwnedCredential(db, ownerId, credentialId)) !== undefined;
}
