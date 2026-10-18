// A probe's Principal is read off its own `users` row by the production host resolver; a probe never stamps a role.
// The sessions service here only reads rows: it mints no session, so it carries no session secret.

import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { UserId } from "@orb/kit/ids";
import { createSessionsRolePolicy, createSessionsService } from "@orb/server/domain/sessions";
import { createHostPrincipalResolver } from "@orb/server/entry/auth";
import { createLocalLightUserSeed } from "@orb/server/entry/boot";
import { env } from "@orb/server/foundation/env";

/** The row-derived resolver over `db`; an absent row degrades to the fail-closed `user` floor, never a grant. */
export function rowPrincipalResolver(db: Db): (userId: UserId) => Promise<Principal> {
  const wiringDb = databaseHandle(db);
  const now = (): number => Date.now();
  const sessions = createSessionsService({
    rolePolicy: createSessionsRolePolicy(env),
    db: wiringDb,
    now,
    sessionSecret: null,
    seedUserConnections: createLocalLightUserSeed({ db: wiringDb, now, onEmbedSpaceBound: (): void => undefined }),
  });
  return createHostPrincipalResolver(sessions);
}
