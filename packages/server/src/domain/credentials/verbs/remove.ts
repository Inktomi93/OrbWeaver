// verb: remove — delete a credential (ownership-scoped). The owner check is the `fetchOwnedCredential` →
// `requireOwned` load (not-owned collapses to `CredentialsNotFoundError`); then a plain DELETE. The ONE FK
// that references credential rows, `user_connections.credential_id`, is SET NULL (schema/connection.ts), so a
// connection on the removed key survives and reads `no-connection` at send until re-keyed.

import type { CredentialContext } from "../context.ts";
import type { RemoveCredentialParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { deleteOwnedCredential, fetchOwnedCredential } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";

export function createRemove(ctx: CredentialContext): CredentialsService["remove"] {
  return async (params: RemoveCredentialParams): Promise<void> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    await deleteOwnedCredential(ctx.db, ownerId, credentialId);
    await ctx.audit({ actorUserId: ownerId, action: "credential.remove", entityType: "credential", entityId: credentialId }, ctx.now());
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
  };
}
