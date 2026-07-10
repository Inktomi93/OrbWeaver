// Shared test harness for the sessions domain (NOT a test file — no `.test` suffix, so test-layout
// ignores it). The 10 verb tests each hand-rolled the same `PEPPER` literal + `createSessionsService`
// construction over a frozen clock. `makeService(db)` is the ONE service wiring (real db, injected frozen
// now, the shared pepper) — matching the sibling `stats/_support.ts` seeder-home convention.

import type { Db } from "@orb/db";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsService } from "@orb/server/domain/sessions";
import { createFrozenClock } from "../../../support/clock.ts";

/** The session-secret pepper the harness binds — ≥32 chars (the KDF/token-hash length floor). */
export const PEPPER = "test-session-secret-at-least-32-chars-long";

/** The real `SessionsService` over `db`, a frozen clock, and the shared pepper (production wiring, no
 *  faked internals — sessions is a real-db, real-scrypt domain). */
export function makeService(db: Db): SessionsService {
  const clock = createFrozenClock();
  return createSessionsService({ db, now: clock.now, sessionSecret: PEPPER });
}
