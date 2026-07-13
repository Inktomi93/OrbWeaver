// domain/credentials/substrate/credential-not-found — maps persistence's undefined (missing or not
// owned) to the typed CredentialsNotFoundError, keeping persistence/ a pure query slot.

import type { UserCredentialId } from "@orb/kit/ids";
import { CredentialsNotFoundError } from "../contract/errors";

export function requireOwned<T>(row: T | undefined, credentialId: UserCredentialId): T {
  if (row === undefined) {
    throw new CredentialsNotFoundError(credentialId);
  }
  return row;
}
