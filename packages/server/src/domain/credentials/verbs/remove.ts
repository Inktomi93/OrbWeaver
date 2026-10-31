// verb: remove — delete a credential (ownership-scoped). The owner check is the `fetchOwnedCredential` →
// `requireOwned` load (not-owned collapses to `CredentialsNotFoundError`); then a plain DELETE. The ONE FK
// that references credential rows, `user_connections.credential_id`, is SET NULL (schema/connection.ts), so a
// connection on the removed key survives and reads `no-connection` at send until re-keyed.
// The owner's runtime state for the key's wire is released only when no other key on that wire remains: two
// agent-sdk keys share one CLI config directory.

import type { RemoveCredentialParams } from "../contract/params.ts";
import type { CredentialContext, CredentialsService } from "../contract/service.ts";
import { deleteOwnedCredential, fetchOwnedCredential, listOwnedCredentials } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";

export function createRemove(ctx: CredentialContext): CredentialsService["remove"] {
  return async (params: RemoveCredentialParams): Promise<void> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    const removed = requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    await deleteOwnedCredential(ctx.db, ownerId, credentialId);
    const wire = ctx.findProvider(removed.provider, ownerId)?.wire;
    if (wire !== undefined) {
      const remaining = await listOwnedCredentials(ctx.db, ownerId);
      if (!remaining.some((row) => ctx.findProvider(row.provider, ownerId)?.wire === wire)) {
        ctx.releaseRuntimeState(ownerId, wire);
      }
    }
    await ctx.audit({ actorUserId: ownerId, action: "credential.remove", entityType: "credential", entityId: credentialId }, ctx.now());
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
  };
}
