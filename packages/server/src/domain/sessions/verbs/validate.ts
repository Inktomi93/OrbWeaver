import type { SessionToken } from "@orb/kit/ids";
import type { ValidatedSession } from "../contract/results.ts";
import type { SessionsContext, SessionsService } from "../contract/service.ts";
import { selectForValidation, slideExpiry } from "../persistence/sessions.ts";

// The Route-A identity-resolution step (ledger D40): cookie token → the caller's principal-fields incl.
// `userId`. The `entry/auth/seam` calls this DIRECTLY (it returns `userId`, unlike the removed infra
// `validateCookie` port) and mints the one `Principal` from it. Every gate (revoked / expired / disabled)
// re-runs EVERY request, so logout / admin-disable / role-change propagate on the NEXT request — orbweaver
// is NOT JWT-baked. The expiry slide WRITE is throttled; `onSlide` reports the new expiry so the route can
// refresh the cookie Max-Age (else the cookie would die 30d after LOGIN regardless of activity).

export function createValidate(ctx: SessionsContext): Pick<SessionsService, "validate"> {
  async function validate(token: SessionToken, onSlide?: (expiresAt: number) => void): Promise<ValidatedSession | null> {
    const now = ctx.now();
    const session = await selectForValidation(ctx.db, ctx.hashToken(token));
    // Gating `enabled` to null here IS how disable takes effect next request.
    if (session === undefined || session.revokedAt !== null || session.expiresAt <= now || !session.enabled) {
      return null;
    }
    if (now - session.lastSeenAt > ctx.slideThrottleMs) {
      const slidExpiresAt = now + ctx.ttlMs;
      await slideExpiry(ctx.db, session.sessionId, now, slidExpiresAt);
      onSlide?.(slidExpiresAt);
    }
    return {
      sessionId: session.sessionId,
      userId: session.userId,
      role: session.role,
      handle: session.handle,
      externalId: session.externalId,
      enabled: session.enabled,
    };
  }
  return { validate };
}
