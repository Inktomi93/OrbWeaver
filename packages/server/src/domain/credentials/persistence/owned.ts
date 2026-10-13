// Ownership is proven by the credentials producer before a binding may refer to its row.
import type { Db } from "@orb/db";
import type { CredentialOwned } from "../contract/owned.ts";
import { fetchOwnedCredential } from "./queries.ts";

export function createCredentialOwned(db: Db): CredentialOwned {
  return async (ownerId, credentialId): Promise<boolean> => (await fetchOwnedCredential(db, ownerId, credentialId)) !== undefined;
}
