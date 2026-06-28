// verb: markRevoked — the RUNNER-INTERNAL revoke (invariant #6). Takes ONLY a credentialId + reason: the
// runner discovers a 401 on a turn and reports the id of the credential that authenticated it — the id IS
// the access token at this layer (the runner proved access by holding it from a completed turn), so there
// is NO ownership check here. MUST NOT be merged with `markRevokedByUser` (which DOES ownership-check)
// until `userId` is threaded through the runner revoke path. `reason` is logged (security event), not
// persisted — orbweaver's schema has only `revoked_at`.

import { securityEvent } from "#foundation/observability";
import type { MarkRevokedParams } from "../contract/params";
import type { CredentialContext, CredentialsService } from "../contract/service";
import { setRevokedById } from "../persistence/queries";

export function createMarkRevoked(ctx: CredentialContext): CredentialsService["markRevoked"] {
  return async (params: MarkRevokedParams): Promise<void> => {
    await setRevokedById(ctx.db, params.credentialId, ctx.now());
    securityEvent(
      "credential_revoked",
      { credentialId: params.credentialId, reason: params.reason, path: "runner" },
      "credentials: marked revoked (runner-internal)",
    );
  };
}
