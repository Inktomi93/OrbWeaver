// verb: maybeRevokeOnAuthFailed — the post-generation `auth_failed` STRIKE-OUT (#1373). The chat engine
// injects it at all three of its generation catch seams (the main turn, the pre-turn compaction, the
// post-turn compaction hook) via the composition root.
//
// THIS IS THE ONE HOME OF THE POLICY, which is why the engine passes the classification instead of a
// verdict: exactly one kind revokes — `auth_failed`, the provider's own statement that it looked at the key
// and rejected it. `rate_limit`, `billing`, `moderation`, `refused`, `forbidden` (OUR firewall), `invalid`,
// `model_unavailable`, `server`, `max_output`, `aborted` and `unknown` must NEVER cost a user their key: a
// 429 is a minute's wait, and revoking on one turns a rate limit into a lockout. There is deliberately NO
// strike counter — one rejection is dispositive (a key the provider refuses is dead now), and the schema
// carries none.
//
// `credentialId === null` is the keyless arm (vllm/local-light/max-pro-sub own no row), so those sources
// skip by construction rather than by a caller remembering to check.
//
// Best-effort: a revoke-write failure is logged and swallowed — the caller is already inside a catch
// surfacing the generation's OWN error, and replacing it with a db error would misreport the failure.
// Idempotent (re-revoking re-stamps `revoked_at`/`revoked_reason`).

import { errorMessage } from "@orb/kit/error-message";
import { getLog, securityEvent } from "#foundation/observability";
import type { ProviderErrorKind } from "#infra/providers";
import type { CredentialContext } from "../context.ts";
import type { MaybeRevokeParams } from "../contract/params.ts";
import type { CredentialsService } from "../contract/service.ts";
import { setRevokedById } from "../persistence/queries.ts";

/** The ONE kind that revokes. `satisfies` (not an annotation) keeps the LITERAL type while still failing
 *  `tsc` if `PROVIDER_ERROR_KINDS` ever drops or renames the member — an annotation would widen it to the
 *  union and quietly turn the guard below into a comparison that proves nothing. */
const AUTH_FAILED = "auth_failed" satisfies ProviderErrorKind;

export function createMaybeRevokeOnAuthFailed(ctx: CredentialContext): CredentialsService["maybeRevokeOnAuthFailed"] {
  return async (params: MaybeRevokeParams): Promise<void> => {
    if (params.errorKind !== AUTH_FAILED || params.credentialId === null) {
      return;
    }
    const { credentialId } = params;
    try {
      await setRevokedById(ctx.db, credentialId, ctx.now(), "auth_failed");
      securityEvent(
        "credential_revoked",
        { credentialId, reason: params.errorMessage, path: "auth_failed" },
        "credentials: marked revoked (post-generation auth_failed strike-out)",
      );
    } catch (err) {
      getLog().error({ credentialId, err: errorMessage(err) }, "credentials: failed to mark revoked (suppressed — the turn's error path still surfaces)");
    }
  };
}
