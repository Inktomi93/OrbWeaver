// verb: markRevoked — the runner-internal revoke. Takes only a credentialId + reason: the runner proved
// access by holding it from a completed turn, so there is no ownership check here. MUST NOT be merged
// with markRevokedByUser (which does ownership-check) until userId is threaded through the runner revoke path.

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
