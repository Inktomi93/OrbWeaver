// domain/credentials/substrate/credential-not-found — the ownership-result mapping helper (credentials.md
// §"The 8-slot layout"). `persistence/queries.ts` does the owner-scoped READ (returns `undefined` when the
// row is missing OR not owned — the two collapse, by `fetchOwned`'s WHERE); THIS pure helper maps that
// `undefined` to the typed `CredentialsNotFoundError` (HTTP 400, not 404 — no existence leak). Separating
// the throw from the query keeps `persistence/` a pure query slot and gives every per-credential verb the
// not-found mapping for free.

import type { UserCredentialId } from "@orb/kit/ids";
import { CredentialsNotFoundError } from "../contract/errors";

/** Return `row` if present, else throw `CredentialsNotFoundError` (not-found and not-owned collapse). */
export function requireOwned<T>(row: T | undefined, credentialId: UserCredentialId): T {
  if (row === undefined) {
    throw new CredentialsNotFoundError(credentialId);
  }
  return row;
}
