// verb: markRevoked — the runner-internal revoke. Takes only a credentialId + reason: the runner proved
// access by holding it from a completed turn, so there is no ownership check here. MUST NOT be merged
// with markRevokedByUser (which does ownership-check) until userId is threaded through the runner revoke path.
// The PERSISTED reason is `auth_failed`: the only thing a runner discovers about a credential it is holding
// is that the provider rejected it (the free-text `reason` stays log-only provenance).

import { securityEvent } from "#foundation/observability";
import type { CredentialContext } from "../context.ts";
import type { MarkRevokedParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { setRevokedById } from "../persistence/queries.ts";

export function createMarkRevoked(ctx: CredentialContext): CredentialsService["markRevoked"] {
  return async (params: MarkRevokedParams): Promise<void> => {
    const now = ctx.now();
    await setRevokedById(ctx.db, params.credentialId, now, "auth_failed");
    // Runner-internal revoke: no owner is proven (the runner holds only the id), so the durable row is
    // system-attributed (`actorUserId: null`) with the id it revoked as the soft-ref entity.
    await ctx.audit(
      {
        actorUserId: null,
        action: "credential.markRevoked",
        entityType: "credential",
        entityId: params.credentialId,
        metadata: { reason: params.reason, path: "runner" },
      },
      now,
    );
    securityEvent(
      "credential_revoked",
      { credentialId: params.credentialId, reason: params.reason, path: "runner" },
      "credentials: marked revoked (runner-internal)",
    );
  };
}
