// verb: clearRevoked — clear a revocation (ownership-scoped). The user knows the key is valid again and
// overrides a transient/stale revoked flag. Owner check via `fetchOwnedCredential` → `requireOwned`, then
// `clearRevokedOwned` nulls `revoked_at`. (A key ROTATION also clears revocation — see `add`'s rotate arm.)

import type { CredentialContext } from "../context";
import type { ClearRevokedParams } from "../contract/params";
import type { CredentialsService } from "../contract/service";
import { clearRevokedOwned, fetchOwnedCredential } from "../persistence/queries";
import { requireOwned } from "../substrate/credential-not-found";

export function createClearRevoked(ctx: CredentialContext): CredentialsService["clearRevoked"] {
  return async (params: ClearRevokedParams): Promise<void> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    await clearRevokedOwned(ctx.db, ownerId, credentialId, ctx.now());
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
  };
}
