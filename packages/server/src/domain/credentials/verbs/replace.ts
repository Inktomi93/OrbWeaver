// verb: replace — the one explicit way a stored key's secret changes, named by id and owner-scoped. The row
// keeps its id and label, so every connection on it moves to the new secret; a fresh key clears revocation.

import type { CredentialContext } from "../context.ts";
import type { ReplaceCredentialParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import type { CredentialView } from "../contract/views.ts";
import { aadFor } from "../persistence/aad.ts";
import { fetchOwnedCredential, rotateSealed } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";
import { reloadView, requireStorage } from "../substrate/stored.ts";

export function createReplace(ctx: CredentialContext): CredentialsService["replace"] {
  return async (params: ReplaceCredentialParams): Promise<CredentialView> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    requireStorage(ctx);
    const row = requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    const sealed = ctx.box.encrypt(params.key.trim(), aadFor(ownerId, row.provider));
    const now = ctx.now();
    await rotateSealed(ctx.db, { ownerId, credentialId, sealed, now });
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "credential.replace",
        entityType: "credential",
        entityId: credentialId,
        metadata: { provider: row.provider, label: row.label },
      },
      now,
    );
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
    return reloadView(ctx, ownerId, credentialId);
  };
}
