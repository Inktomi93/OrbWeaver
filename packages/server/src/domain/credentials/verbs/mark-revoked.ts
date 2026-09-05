// verb: markRevoked — the runner-internal revoke. No Principal (the runner discovers a 401 and holds only
// ids), but it DOES carry the `ownerId` the row must belong to: `setRevokedById` is owner-scoped, so a
// foreign id matches no row rather than relying on the caller having proved anything. It stays DISTINCT from
// markRevokedByUser, which additionally proves ownership up front (leak-free NOT_FOUND on a stranger's id
// rather than a silent no-op), audits under a different action and emits `credentialsChanged` to the owner.
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
    await setRevokedById(ctx.db, { ownerId: params.ownerId, credentialId: params.credentialId, revokedAt: now, reason: "auth_failed" });
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
