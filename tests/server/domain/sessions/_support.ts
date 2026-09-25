// Shared test harness for the sessions domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). The 10 verb tests each hand-rolled the same `PEPPER` literal + `createSessionsService`
// construction over a frozen clock. `makeService(db)` is the ONE service wiring (real db, injected frozen
// now, the shared pepper) — matching the sibling `stats/_support.ts` seeder-home convention.

import type { Db } from "@orb/db";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { createLocalLightUserSeed } from "@orb/server/entry/boot";
import type { Clock } from "../../../support/clock.ts";
import { createFrozenClock } from "../../../support/clock.ts";

/** The session-secret pepper the harness binds — ≥32 chars (the KDF/token-hash length floor). */
export const PEPPER = "test-session-secret-at-least-32-chars-long";

/** The real `SessionsService` over `db`, a frozen clock, and the shared pepper (production wiring, no
 *  faked internals — sessions is a real-db, real-scrypt domain). The clock handle is returned so
 *  time-dependent tests (TTL expiry, slide-throttle) can `advance()` it.
 *
 *  #2481 — `seedUserConnections` is the REAL composition-root op, not a recorder, for the same reason the
 *  admin harness keeps the batch-riding statements real: the property under test is that a minted account
 *  ends up holding `user_connections` ROWS, and a recorder would record a call and prove nothing about the
 *  rows. It is also what production hands in, so the harness cannot drift from the wiring it stands for. */
export function makeService(db: Db): { svc: SessionsService; clock: Clock } {
  const clock = createFrozenClock();
  const seedUserConnections = createLocalLightUserSeed({ db, now: clock.now, onEmbedSpaceBound: () => undefined });
  return { svc: createSessionsService({ db, now: clock.now, sessionSecret: PEPPER, seedUserConnections }), clock };
}
