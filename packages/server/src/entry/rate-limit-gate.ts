// The composition-root adapter that turns the DB-backed limiter primitive into the `RateLimitGate` the
// tRPC ladder reads off `ctx.rateLimit`. Two buckets: publicIp (tight per-IP, anonymous callers) and
// authedGeneral (looser per-user). Caps + window come from the boot-env floor.

import type { Db } from "@orb/db";
import { env } from "#foundation/env";
import type { RateLimiter } from "../transport/rate-limit";
import { createRateLimiter } from "../transport/rate-limit";
import type { RateLimitDecision, RateLimitGate } from "../transport/trpc";

// The anonymous caller has no userId to key on; key the tight per-IP bucket on a stable sentinel when the
// peer address couldn't be derived (better to share one throttle than to leak an un-throttled hole).
const UNKNOWN_IP_KEY = "unknown";
const PUBLIC_IP_SCOPE = "public-ip";
const AUTHED_GENERAL_SCOPE = "general";

// Per-verb hub buckets (hub-browse doc 03 §4) — the hubs are SHARED third-party resources; one user's
// scripted scraping must not get the server's IP blocked for everyone. These ride ON TOP of the general
// authed bucket (a tighter, per-user, 1-minute cap keyed on the specific hub verb). The two most expensive
// egress verbs get the tightest caps: previewCard (full card download + parse) and importCard (download +
// DB import). The avatar proxy is a RAW Hono route, not a tRPC procedure, so its 120/min bucket can't ride
// this gate — it's built by `createHubAvatarLimiter` and consumed inside the route (cache hits don't debit).
const HUB_BUCKET_WINDOW_MS = 60_000;
export const HUB_VERB_LIMITS: Readonly<Record<string, number>> = {
  "hub.search": 30,
  "hub.getCard": 30,
  "hub.previewCard": 12,
  "hub.importCard": 6,
};

/** The avatar proxy's per-user bucket (doc 03 §4 — 120/min). Same DB-backed fixed-window primitive as the
 *  tRPC hub buckets (scope `hub:hub.avatar`, keyed on the actor's userId), built here so the mechanics stay
 *  ONE shape; the raw `/api/hub/:hub/avatar/*` route consumes it on a cache MISS (a cache hit never debits). */
const HUB_AVATAR_LIMIT = 120;
export function createHubAvatarLimiter(deps: RateLimitGateDeps): RateLimiter {
  return createRateLimiter(deps.db, { scope: "hub:hub.avatar", points: HUB_AVATAR_LIMIT, windowMs: HUB_BUCKET_WINDOW_MS, now: deps.now });
}

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

  // One limiter per metered hub verb, keyed by its tRPC path (scope `hub:<path>`), each on a 1-minute window.
  const hubBuckets = new Map<string, RateLimiter>(
    Object.entries(HUB_VERB_LIMITS).map(([path, points]) => [
      path,
      createRateLimiter(deps.db, { scope: `hub:${path}`, points, windowMs: HUB_BUCKET_WINDOW_MS, now: deps.now }),
    ]),
  );

  return {
    enforce: async (decision: RateLimitDecision): Promise<void> => {
      if (decision.principal === null) {
        await publicIp.consume(decision.clientIp ?? UNKNOWN_IP_KEY);
        return;
      }
      await authedGeneral.consume(decision.principal.userId);
      // The per-verb hub bucket rides ON TOP of the general authed bucket (shared third-party resource).
      const hubBucket = hubBuckets.get(decision.path);
      if (hubBucket !== undefined) {
        await hubBucket.consume(decision.principal.userId);
      }
    },
  };
}
