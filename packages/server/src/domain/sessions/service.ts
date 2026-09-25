// domain/sessions — COMPOSITION ROOT: wires the verbs over the DI bundle (zero logic). The revocable
// BFF session lifecycle + identity resolution. Pure DB + crypto — NO cookie I/O (the route sets the
// cookie) and NO `Principal` mint (the `entry/auth/seam` does that from validate/provisionIdentity/
// ensureUser). The `SESSION_SECRET` pepper is injected here and bound into the token hasher (D38); the
// clock is injected for determinism (no ambient `Date.now()` in a verb).

import type { Db } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { createSessionsContext } from "./context.ts";
import type { SessionsService } from "./contract/service.ts";
import { selectOwnerUserId } from "./persistence/users.ts";
import { createAuthenticate } from "./verbs/authenticate.ts";
import { createCreate } from "./verbs/create.ts";
import { createEnsureUser } from "./verbs/ensure-user.ts";
import { createLinkExternalId } from "./verbs/link-external-id.ts";
import { createList } from "./verbs/list.ts";
import { createLoadUserById } from "./verbs/load-user-by-id.ts";
import { createOwnerPassword } from "./verbs/owner-password.ts";
import { createProvisionIdentity } from "./verbs/provision-identity.ts";
import { createResolveHandle } from "./verbs/resolve-handle.ts";
import { createRevoke } from "./verbs/revoke.ts";
import { createSignup } from "./verbs/signup.ts";
import { createValidate } from "./verbs/validate.ts";

/** What the composition root needs: the db handle, the injected clock, and the raw `SESSION_SECRET` pepper
 *  (read DOWN from `foundation/env` at `entry/`; bound into the token hasher here). */
interface SessionsServiceDeps {
  db: Db;
  now: () => number;
  sessionSecret: string | null;
  /** #2481 — the injected per-user local-light seed (`SessionsContext.seedUserConnections`). Required on
   *  purpose: a composition root that forgets it mints accounts with no vector floor, silently, which is the
   *  defect this closes. Build it with `createLocalLightUserSeed` at `entry/boot/seed-local-light.ts`. */
  seedUserConnections: (userId: UserId) => Promise<void>;
}

export function createSessionsService(deps: SessionsServiceDeps): SessionsService {
  const ctx = createSessionsContext(deps.db, deps.now, deps.sessionSecret, deps.seedUserConnections);
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
    ...createLinkExternalId(ctx),
    ...createOwnerPassword(ctx),
    ...createSignup(ctx),
    getOwnerUserId: (): Promise<UserId | undefined> => selectOwnerUserId(ctx.db),
  };
}
