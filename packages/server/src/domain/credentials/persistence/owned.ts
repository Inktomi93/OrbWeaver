// Ownership is proven by the credentials producer before a binding may refer to its row.
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { CredentialOwned } from "../contract/owned.ts";
import { fetchOwnedCredential } from "./queries.ts";

export function createCredentialOwned(handle: DatabaseHandle): CredentialOwned {
  const db = databaseForOwner(handle);
  return async (ownerId, credentialId): Promise<boolean> => (await fetchOwnedCredential(db, ownerId, credentialId)) !== undefined;
}
