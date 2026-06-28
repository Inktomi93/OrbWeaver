// verb: maybeRevokeOnAuthFailed — the post-turn `auth_failed` side-effect (chat engine + compaction inject
// this; credentials.md §"Cross-feature composition"). Centralizes the policy so every turn path follows it
// without duplicating the conditional: if the turn failed with `auth_failed` AND a BYO credential
// authenticated it (`credentialId !== null` — keyless host/vllm/local-light have no row to revoke), mark
// that credential revoked. Best-effort: a revoke-write failure is logged but never breaks the verb's own
// error path (the turn's failure still surfaces). Idempotent (re-revoking just re-stamps `revoked_at`).

import { errorMessage } from "@orb/kit/error-message";
import { getLog, securityEvent } from "#foundation/observability";
import type { MaybeRevokeParams } from "../contract/params";
import type { CredentialContext, CredentialsService } from "../contract/service";
import { setRevokedById } from "../persistence/queries";

const AUTH_FAILED = "auth_failed";

export function createMaybeRevokeOnAuthFailed(
  ctx: CredentialContext,
): CredentialsService["maybeRevokeOnAuthFailed"] {
  return async (params: MaybeRevokeParams): Promise<void> => {
    if (params.errorKind !== AUTH_FAILED || params.credentialId === null) {
      return;
    }
    const { credentialId } = params;
    try {
      await setRevokedById(ctx.db, credentialId, ctx.now());
      securityEvent(
        "credential_revoked",
        { credentialId, reason: params.errorMessage, path: "auth_failed" },
        "credentials: marked revoked (post-turn auth_failed)",
      );
    } catch (err) {
      getLog().error(
        { credentialId, err: errorMessage(err) },
        "credentials: failed to mark revoked (suppressed — the turn's error path still surfaces)",
      );
    }
  };
}
