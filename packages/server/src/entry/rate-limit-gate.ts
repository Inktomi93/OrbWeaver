// The composition-root adapter that turns the DB-backed limiter primitive into the `RateLimitGate` the
// tRPC ladder reads off `ctx.rateLimit`. Three buckets keyed on the RESOLVED admin config (env floor ⊕
// AppSettings override), read fresh per request so a mid-session admin edit is LIVE (updateAppSettings →
// reloadEffectiveConfig rebuilds the effective-config cache; every consume reads the current cap the same
// way the engineLaunch/maxImageBytes consumers do):
//   - publicIp   — tight per-IP bucket for anonymous callers (rateLimits.publicIp)
//   - general    — loose per-user bucket for a normal authed request (rateLimits.authed)
//   - ai-turn    — the STRICTER per-user bucket for the chat router's $/GPU-spending verbs; a turn call
//                  debits BOTH the ai-turn bucket AND the general bucket (an AI turn is also a request).
//   - restart    — a fixed per-user bucket for `admin.restart`, not an admin knob; it also debits general.
//
// The `general` SCOPE literal is kept (existing bucket rows + the inversion suite key on `general:`); its
// cap is `rateLimits.authed` — the "authed per-user" bucket the design doc (Tier-4-Transport §"buckets")
// names "general". Window is env-only (`RATE_LIMIT_WINDOW_MS`, no AppSettings override — a fixed-window
// size, not a cap).
//
// NOTE — the `general` SCOPE literal (below) is the AUTHED per-user bucket; its cap is `rateLimits.authed`.
// The former `rateLimits.general` FIELD was DELETED (owner-final, D107): it was never consumed (no
// recoverable enforcement point distinct from `authed`), its name was poisoned, and the knob-wire gate makes
// a future re-add safe. Deleting it loosened nothing (it drove no bucket). The login-attempt cap now rides
// `rateLimits.login` (auth-routes.ts threads getEffectiveConfig().rateLimits.login into the login limiter).

import type { ResolvedRateLimits } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { env } from "#foundation/env";
import { createRateLimiter } from "../transport/rate-limit.ts";
import type { RateLimitDecision, RateLimitGate } from "../transport/trpc/index.ts";

// The anonymous caller has no userId to key on; key the tight per-IP bucket on a stable sentinel when the
// peer address couldn't be derived (better to share one throttle than to leak an un-throttled hole).
const UNKNOWN_IP_KEY = "unknown";
const PUBLIC_IP_SCOPE = "public-ip";
const AUTHED_GENERAL_SCOPE = "general";
const AI_TURN_SCOPE = "ai-turn";

// The chat router's $/GPU-spending verb paths — every path here fires inference or image generation, so it
// debits the STRICTER ai-turn bucket on top of the general request bucket. ONE home: the typed map below
// IS the declaration and the union derives from its keys (Tier-4-Transport §"aiTurn": "derives from a
// typed map of the chat router's $-spending verbs") — a new spending verb is classified by adding (or
// deliberately omitting) its key here, never a silent free-turn leak. The generating verbs are the ones
// the chat turn front-door (domain/chat/verbs/turn.ts header) drives through the engine: send / swipe /
// continueTurn / impersonateStream / generate / forceCharacterTurn, plus the imagery generateImage.
// impersonateStream persists nothing but STILL runs a real generation (GPU/$ spend) — a SUBSCRIPTION that
// debits ONCE at subscribe time (one impersonate click = one stream), so it's rate-limited like every other
// turn. Deliberately EXCLUDED (no $/GPU spend at call time): chat.fork (copies canon), chat.abort /
// undoContinue / revertContinue (control + canon-shuffle, no generation), and every read verb.
const AI_TURN_PATHS = {
  "chat.send": true,
  "chat.swipe": true,
  "chat.continueTurn": true,
  "chat.impersonateStream": true,
  "chat.generate": true,
  "chat.forceCharacterTurn": true,
  "chat.generateImage": true,
} as const;

type AiTurnPath = keyof typeof AI_TURN_PATHS;

// `admin.restart` ends the process, so its bucket must be durable (these rows outlive the restart they count) and
// fixed rather than an admin knob: a restart loop signs out every visitor who came in through a relay on each pass.
const RESTART_PATH = "admin.restart";
const RESTART_SCOPE = "restart";
const RESTART_POINTS = 3;
const RESTART_WINDOW_MS = 600_000;

function isAiTurnPath(path: string): path is AiTurnPath {
  return path in AI_TURN_PATHS;
}

export interface RateLimitGateDeps {
  readonly db: Db;
  readonly now: () => number;
  /** The RESOLVED rate-limit caps (env floor ⊕ admin override), read FRESH per request — a mid-session
   *  admin edit reloads the effective-config cache, so the next consume sees the new cap (LIVE). */
  readonly resolveRateLimits: () => ResolvedRateLimits;
}

/** Build the production `RateLimitGate`: anonymous → tight per-IP bucket; authenticated → per-user bucket;
 *  a $/GPU turn verb additionally debits the stricter per-user ai-turn bucket. */
export function createRateLimitGate(deps: RateLimitGateDeps): RateLimitGate {
  const publicIp = createRateLimiter(deps.db, {
    scope: PUBLIC_IP_SCOPE,
    points: () => deps.resolveRateLimits().publicIp,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    now: deps.now,
  });
  const authedGeneral = createRateLimiter(deps.db, {
    scope: AUTHED_GENERAL_SCOPE,
    points: () => deps.resolveRateLimits().authed,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    now: deps.now,
  });
  const aiTurn = createRateLimiter(deps.db, {
    scope: AI_TURN_SCOPE,
    points: () => deps.resolveRateLimits().aiTurn,
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    now: deps.now,
  });
  const restart = createRateLimiter(deps.db, { scope: RESTART_SCOPE, points: RESTART_POINTS, windowMs: RESTART_WINDOW_MS, now: deps.now });

  return {
    enforce: async (decision: RateLimitDecision): Promise<void> => {
      if (decision.principal === null) {
        await publicIp.consume(decision.clientIp ?? UNKNOWN_IP_KEY);
        return;
      }
      const userId = decision.principal.userId;
      // A $/GPU turn hits the STRICTER ai-turn bucket first, then the general request bucket — an AI turn is
      // also a request, so it debits both (throttled by whichever cap trips first).
      if (isAiTurnPath(decision.path)) {
        await aiTurn.consume(userId);
      }
      if (decision.path === RESTART_PATH) {
        await restart.consume(userId);
      }
      await authedGeneral.consume(userId);
    },
  };
}
