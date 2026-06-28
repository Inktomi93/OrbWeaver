// entry/rate-limit-gate — the composition-root adapter that turns the DB-backed limiter PRIMITIVE
// (transport/rate-limit) into the `RateLimitGate` the tRPC ladder reads off `ctx.rateLimit`. The limiter
// instances need `db` at construction, so they are built HERE (the entry root) and the bucket POLICY (which
// id keys which bucket) lives here too — transport only declares the `RateLimitGate` port + calls `enforce`.
//
// TWO buckets wired now (the $/GPU `aiTurn` bucket + the per-member COUNT budget are chat P5 — NOT here):
//   • publicIp     — the tight per-IP bucket for an anonymous caller (keyed on `clientIp`).
//   • authedGeneral — the looser per-user bucket for an authenticated caller (keyed on `principal.userId`).
// Caps + window come from the boot-env floor (`foundation/env` RATE_LIMIT_*) — the env IS the named source
// (no inline magic numbers). `now` is the injected entry clock (the limiter's only impurity).

import type { Db } from "@orb/db";
import { env } from "#foundation/env";
import { createRateLimiter } from "../transport/rate-limit";
import type { RateLimitDecision, RateLimitGate } from "../transport/trpc";

// The anonymous caller has no userId to key on; key the tight per-IP bucket on a stable sentinel when the
// peer address couldn't be derived (better to share one throttle than to leak an un-throttled hole).
const UNKNOWN_IP_KEY = "unknown";
const PUBLIC_IP_SCOPE = "public-ip";
const AUTHED_GENERAL_SCOPE = "general";

export interface RateLimitGateDeps {
  readonly db: Db;
  readonly now: () => number;
}

/** Build the production `RateLimitGate`: anonymous → tight per-IP bucket; authenticated → per-user bucket. */
export function createRateLimitGate(deps: RateLimitGateDeps): RateLimitGate {
  const publicIp = createRateLimiter(deps.db, {
    scope: PUBLIC_IP_SCOPE,
    points: env.RATE_LIMIT_PUBLIC_IP,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    now: deps.now,
  });
  const authedGeneral = createRateLimiter(deps.db, {
    scope: AUTHED_GENERAL_SCOPE,
    points: env.RATE_LIMIT_AUTHED,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    now: deps.now,
  });

  return {
    enforce: async (decision: RateLimitDecision): Promise<void> => {
      if (decision.principal === null) {
        await publicIp.consume(decision.clientIp ?? UNKNOWN_IP_KEY);
        return;
      }
      await authedGeneral.consume(decision.principal.userId);
    },
  };
}
