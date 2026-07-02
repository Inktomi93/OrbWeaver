// domain/sessions — COMPOSITION ROOT: wires the 10 verbs over the DI bundle (zero logic). The revocable
// BFF session lifecycle + identity resolution. Pure DB + crypto — NO cookie I/O (the route sets the
// cookie) and NO `Principal` mint (the `entry/auth/seam` does that from validate/provisionIdentity/
// ensureUser). The `SESSION_SECRET` pepper is injected here and bound into the token hasher (D38); the
// clock is injected for determinism (no ambient `Date.now()` in a verb).

import type { Db } from "@orb/db";
import { createSessionsContext } from "./context";
import type { SessionsService } from "./contract/service";
import { createAuthenticate } from "./verbs/authenticate";
import { createCreate } from "./verbs/create";
import { createEnsureUser } from "./verbs/ensure-user";
import { createList } from "./verbs/list";
import { createLoadUserById } from "./verbs/load-user-by-id";
import { createProvisionIdentity } from "./verbs/provision-identity";
import { createResolveHandle } from "./verbs/resolve-handle";
import { createRevoke } from "./verbs/revoke";
import { createValidate } from "./verbs/validate";

/** What the composition root needs: the db handle, the injected clock, and the raw `SESSION_SECRET` pepper
 *  (read DOWN from `foundation/env` at `entry/`; bound into the token hasher here). */
interface SessionsServiceDeps {
  db: Db;
  now: () => number;
  sessionSecret: string | null;
}

export function createSessionsService(deps: SessionsServiceDeps): SessionsService {
  const ctx = createSessionsContext(deps.db, deps.now, deps.sessionSecret);
  return {
    ...createCreate(ctx),
    ...createValidate(ctx),
    ...createRevoke(ctx),
    ...createList(ctx),
    ...createEnsureUser(ctx),
    ...createProvisionIdentity(ctx),
    ...createLoadUserById(ctx),
    ...createResolveHandle(ctx),
    ...createAuthenticate(ctx),
  };
}
