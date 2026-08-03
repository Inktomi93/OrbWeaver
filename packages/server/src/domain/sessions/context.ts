// domain/sessions/context — DI bundle builder (db + injected clock + the token mint + bound token hasher +
// session timing). A composition surface, one of the few places allowed to reach the tokens/ named subsystem
// — it binds the mint + the peppered hasher so verbs read ctx.mintToken/ctx.hashToken/ctx.ttlMs/
// ctx.slideThrottleMs and import nothing from tokens/.

import type { Db } from "@orb/db";
import { createPasswordHasher } from "#infra/auth";
import type { SessionsContext } from "./contract/service.ts";
import { createTokenHasher, mintSessionToken, SESSION_TTL_MS, SLIDE_THROTTLE_MS } from "./tokens/tokens.ts";

export function createSessionsContext(db: Db, now: () => number, sessionSecret: string | null): SessionsContext {
  return {
    db,
    now,
    mintToken: mintSessionToken,
    hashToken: createTokenHasher(sessionSecret),
    // Bound from the same pepper as the token hasher. Unset pepper -> a disabled hasher that throws at call time.
    verifyPassword: createPasswordHasher(sessionSecret).verify,
    ttlMs: SESSION_TTL_MS,
    slideThrottleMs: SLIDE_THROTTLE_MS,
  };
}
