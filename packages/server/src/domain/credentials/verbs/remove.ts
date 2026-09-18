// verb: remove — delete a credential (ownership-scoped). The owner check is the `fetchOwnedCredential` →
// `requireOwned` load (not-owned collapses to `CredentialsNotFoundError`); then a plain DELETE — nothing
// references credential rows by FK (a chat resolves the user's ACTIVE credential at turn time, no per-chat
// pin). If the removed row was active, the user simply has no active credential afterwards.

import type { CredentialContext } from "../context.ts";
import type { RemoveCredentialParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { deleteOwnedCredential, fetchOwnedCredential } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";
import { republishOwnerSavedEndpoints } from "../substrate/egress-admission.ts";

export function createRemove(ctx: CredentialContext): CredentialsService["remove"] {
  return async (params: RemoveCredentialParams): Promise<void> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    await deleteOwnedCredential(ctx.db, ownerId, credentialId);
    await ctx.audit({ actorUserId: ownerId, action: "credential.remove", entityType: "credential", entityId: credentialId }, ctx.now());
    // The removed row may have been an OWNER-declared endpoint holding the SSRF belt open for its host:port
    // — re-derive BEFORE returning so the door is shut by the time the caller sees the delete succeed.
    await republishOwnerSavedEndpoints(ctx);
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
  };
}
