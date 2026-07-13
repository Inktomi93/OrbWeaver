// verb: list — the caller's credentials (all providers, all labels), ordered `(provider, createdAt)`.
// Owner-scoped by `principal.userId`. Every row is projected through `toCredentialView`, so no secret
// field (ciphertext/iv/tag) or plaintext key ever reaches the wire (invariant #4).

import type { CredentialContext } from "../context";
import type { ListCredentialsParams } from "../contract/params";
import type { CredentialsService } from "../contract/service";
import type { CredentialView } from "../contract/views";
import { listOwnedCredentials, toCredentialView } from "../persistence/queries";

export function createList(ctx: CredentialContext): CredentialsService["list"] {
  return async (params: ListCredentialsParams): Promise<CredentialView[]> => {
    const rows = await listOwnedCredentials(ctx.db, params.principal.userId);
    return rows.map(toCredentialView);
  };
}
