// verb: markRevokedByUser — the USER-FACING revoke (invariant #6). Unlike the runner-internal `markRevoked`,
// this ADDS the ownership check (`fetchOwnedCredential` → `requireOwned`) before writing — a user pre-empts
// the next turn's 401 round-trip when they know their key was rotated/leaked upstream. `reason` defaults to
// "manually revoked by user" (logged, not persisted).

import { securityEvent } from "#foundation/observability";
import type { CredentialContext } from "../context";
import type { MarkRevokedByUserParams } from "../contract/params";
import type { CredentialsService } from "../contract/service";
import { fetchOwnedCredential, setRevokedById } from "../persistence/queries";
import { requireOwned } from "../substrate/credential-not-found";

const DEFAULT_REASON = "manually revoked by user";

export function createMarkRevokedByUser(ctx: CredentialContext): CredentialsService["markRevokedByUser"] {
  return async (params: MarkRevokedByUserParams): Promise<void> => {
    const ownerId = params.principal.userId;
    const { credentialId } = params;
    requireOwned(await fetchOwnedCredential(ctx.db, ownerId, credentialId), credentialId);
    const now = ctx.now();
    const reason = params.reason ?? DEFAULT_REASON;
    await setRevokedById(ctx.db, credentialId, now);
    await ctx.audit(
      { actorUserId: ownerId, action: "credential.markRevokedByUser", entityType: "credential", entityId: credentialId, metadata: { reason, path: "user" } },
      now,
    );
    securityEvent("credential_revoked", { credentialId, reason, path: "user" }, "credentials: marked revoked (user)");
    ctx.emitUserEvent(ownerId, { type: "credentialsChanged", credentialId });
  };
}
