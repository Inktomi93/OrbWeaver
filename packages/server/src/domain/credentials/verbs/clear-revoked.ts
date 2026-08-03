// verb: clearRevoked — clear a revocation (ownership-scoped). The user knows the key is valid again and
// overrides a transient/stale revoked flag. Owner check via `fetchOwnedCredential` → `requireOwned`, then
// `clearRevokedOwned` nulls `revoked_at`. (A key ROTATION also clears revocation — see `add`'s rotate arm.)

import type { CredentialContext } from "../context.ts";
import type { ClearRevokedParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { clearRevokedOwned, fetchOwnedCredential } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";

export function createClearRevoked(ctx: CredentialContext): CredentialsService["clearRevoked"] {
  return async (params: ClearRevokedParams): Promise<void> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    const now = ctx.now();
    await clearRevokedOwned(ctx.db, ownerId, credentialId, now);
    await ctx.audit({ actorUserId: ownerId, action: "credential.clearRevoked", entityType: "credential", entityId: credentialId }, now);
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
  };
}
