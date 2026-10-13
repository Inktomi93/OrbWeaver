// Only the dispatched material may be struck: a same-id replacement is not the rejected key.
// Persistence is a passenger; its diagnostics must not expose the sealed comparison parameters.

import type { ProviderErrorKind } from "@orb/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { redactKnownSecrets } from "@orb/kit/secret-redaction";
import { getLog, securityEvent } from "#foundation/observability";
import type { CredentialContext } from "../context.ts";
import type { MaybeRevokeParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { strikeCredentialExecution } from "../persistence/queries.ts";
import { capturedCredentialExecution } from "../substrate/execution-witness.ts";

const AUTH_FAILED = "auth_failed" satisfies ProviderErrorKind;

// System attribution does not claim a Principal was proven at this runner boundary.
async function reportOwnerMismatch(
  ctx: CredentialContext,
  args: { readonly ownerId: UserId; readonly credentialId: UserCredentialId; readonly now: number },
): Promise<void> {
  await ctx.audit(
    {
      actorUserId: null,
      action: "credential.revokeOwnerMismatch",
      entityType: "credential",
      entityId: args.credentialId,
      metadata: { claimedOwnerId: args.ownerId, path: "auth_failed" },
    },
    args.now,
  );
  securityEvent(
    "credential_revoke_owner_mismatch",
    { credentialId: args.credentialId, claimedOwnerId: args.ownerId, path: "auth_failed" },
    "credentials: a post-generation strike-out named a credential this owner does not hold — nothing revoked",
  );
}

export function createMaybeRevokeOnAuthFailed(ctx: CredentialContext): CredentialsService["maybeRevokeOnAuthFailed"] {
  return async (params: MaybeRevokeParams): Promise<void> => {
    if (params.errorKind !== AUTH_FAILED || params.credentialId === null) {
      return;
    }
    const { credentialId, ownerId } = params;
    const now = ctx.now();
    let sealedLiterals: readonly string[] = [];
    try {
      const captured = capturedCredentialExecution(params.executionWitness);
      sealedLiterals = [captured.sealed.ciphertext, captured.sealed.iv, captured.sealed.tag];
      if (captured.credentialId !== credentialId) {
        throw new Error("credential execution evidence does not authorize the named credential");
      }
      if (captured.ownerId !== ownerId) {
        await reportOwnerMismatch(ctx, { ownerId, credentialId, now });
        return;
      }
      const revoked = await strikeCredentialExecution(ctx.db, captured, now);
      if (revoked.length === 0) {
        await reportOwnerMismatch(ctx, { ownerId, credentialId, now });
        return;
      }
      if (!revoked.some((row) => row.applied)) {
        return;
      }
      // Audit failures remain passengers of the original provider error.
      await ctx.audit(
        {
          actorUserId: null,
          action: "credential.markRevoked",
          entityType: "credential",
          entityId: credentialId,
          metadata: { reason: params.errorMessage, path: "auth_failed" },
        },
        now,
      );
      securityEvent(
        "credential_revoked",
        { credentialId, ownerId, reason: params.errorMessage, path: "auth_failed" },
        "credentials: marked revoked (post-generation auth_failed strike-out)",
      );
    } catch (err) {
      getLog().error(
        { credentialId, err: redactKnownSecrets(errorMessage(err), sealedLiterals) },
        "credentials: failed to mark revoked (suppressed — the turn's error path still surfaces)",
      );
    }
  };
}
