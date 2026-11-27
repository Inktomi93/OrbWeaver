// verb: markRevokedByUser — the USER-FACING revoke. Unlike the runner-internal `maybeRevokeOnAuthFailed`,
// this ADDS the ownership check (`fetchOwnedCredential` → `requireOwned`) before writing — a user pre-empts
// the next turn's 401 round-trip when they know their key was rotated/leaked upstream. The audit and log text is
// the fixed `REVOKE_REASON_TEXT` (the PERSISTED cause is the `"user"` member of `CRED_REVOKED_REASONS`,
// which is what the pane renders).

import { securityEvent } from "#foundation/observability";
import type { MarkRevokedByUserParams } from "../contract/params.ts";
import type { CredentialContext, CredentialsService } from "../contract/service.ts";
import { fetchOwnedCredential, setRevokedById } from "../persistence/queries.ts";
import { requireOwned } from "../substrate/credential-not-found.ts";

const REVOKE_REASON_TEXT = "manually revoked by user";

export function createMarkRevokedByUser(ctx: CredentialContext): CredentialsService["markRevokedByUser"] {
  return async (params: MarkRevokedByUserParams): Promise<void> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    const now = ctx.now();
    await setRevokedById(ctx.db, { ownerId, credentialId, revokedAt: now, reason: "user" });
    await ctx.audit(
      {
        actorUserId: ownerId,
        action: "credential.markRevokedByUser",
        entityType: "credential",
        entityId: credentialId,
        metadata: { reason: REVOKE_REASON_TEXT, path: "user" },
      },
      now,
    );
    securityEvent("credential_revoked", { credentialId, reason: REVOKE_REASON_TEXT, path: "user" }, "credentials: marked revoked (user)", ctx.logger);
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
  };
}
