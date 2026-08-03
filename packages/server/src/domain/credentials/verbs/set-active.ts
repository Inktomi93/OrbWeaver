// verb: setActive — promote a credential to active (ownership-scoped), atomically demoting any other
// active row in its `(owner, provider)` slot. The owner check is the `fetchOwnedCredential` → `requireOwned`
// load (a not-owned id collapses to `CredentialsNotFoundError`, HTTP 400 — no existence leak). Idempotent:
// re-activating the already-active row demotes-then-re-promotes the same row to the same state.

import type { CredentialContext } from "../context.ts";
import type { SetActiveParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import type { CredentialView } from "../contract/views.ts";
import { fetchOwnedCredential, promoteActive, toCredentialView } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";

export function createSetActive(ctx: CredentialContext): CredentialsService["setActive"] {
  return async (params: SetActiveParams): Promise<CredentialView> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    const row = requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    const now = ctx.now();
    await promoteActive(ctx.db, {
      ownerId,
      credentialId,
      provider: row.provider,
      now,
    });
    const updated = requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    await ctx.audit(
      { actorUserId: ownerId, action: "credential.setActive", entityType: "credential", entityId: credentialId, metadata: { provider: row.provider } },
      now,
    );
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
    return toCredentialView(updated);
  };
}
