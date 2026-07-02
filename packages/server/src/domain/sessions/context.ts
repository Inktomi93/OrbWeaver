// domain/sessions — DI BUNDLE: the ctx verbs close over (db + the injected clock + the bound token hasher
// + the session timing). The bundle TYPE is the explicit `SessionsContext` interface in
// `contract/service.ts` (no `ReturnType<>` — `no-context-returntype`); this file is the BUILDER. As a
// composition surface it is the ONE place (with service.ts/index.ts) allowed to reach the `tokens/` named
// subsystem (`domain-substrate-mediates-subsystems`) — it binds the peppered hasher + lifts the timing
// constants into the context so verbs read `ctx.hashToken`/`ctx.ttlMs`/`ctx.slideThrottleMs` and import
// NOTHING from `tokens/`. No shared read primitive lives here — each verb routes through `persistence/`.

import type { Db } from "@orb/db";
import { createPasswordHasher } from "#infra/auth";
import type { SessionsContext } from "./contract/service";
import { createTokenHasher, SESSION_TTL_MS, SLIDE_THROTTLE_MS } from "./tokens/tokens";

export function createSessionsContext(
  db: Db,
  now: () => number,
  sessionSecret: string | null,
): SessionsContext {
  return {
    db,
    now,
    hashToken: createTokenHasher(sessionSecret),
    // The password VERIFY half (PD-83) — bound from the SAME pepper as the token hasher (infra/auth's
    // sealed adapter, imported DOWN; the hash MINT half stays admin's injected op). Unset pepper ⇒ a
    // disabled hasher that throws at call time (AUTH_MODE=local env-requires SESSION_SECRET).
    verifyPassword: createPasswordHasher(sessionSecret).verify,
    ttlMs: SESSION_TTL_MS,
    slideThrottleMs: SLIDE_THROTTLE_MS,
  };
}
