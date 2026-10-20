// Internal domain identity comes from the production row resolver, not a fabricated authentication claim.
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";
import type { UserId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { createSessionsRolePolicy, createSessionsService } from "@orb/server/domain/sessions";
import { createHostPrincipalResolver } from "@orb/server/entry/auth";
import { createLocalLightUserSeed } from "@orb/server/entry/boot";
import { env } from "@orb/server/foundation/env";
import { createFrozenClock } from "../../iso/clock.ts";
import type { ServerTestHarness } from "../server.ts";
import type { UserIdentity } from "./user.ts";
import { seedUserIdentity } from "./user.ts";

/**
 * Resolve the actual stored role for internal domain work; this does not prove request authentication or enabled admission.
 * A field named in `identity` is first written onto the user's row, so the resolved Principal never disagrees with its row.
 */
export async function principal(root: Pick<ServerTestHarness, "db">, userId: UserId, identity: UserIdentity = {}): Promise<Principal> {
  if (identity.role !== undefined || identity.handle !== undefined) {
    await seedUserIdentity(root.db, userId, identity);
  }
  return await rowPrincipalResolver(root.db)(userId);
}

function sessionsOver(db: Db): SessionsService {
  const handle = databaseHandle(db);
  const { now } = createFrozenClock();
  return createSessionsService({
    rolePolicy: createSessionsRolePolicy(env),
    db: handle,
    now,
    sessionSecret: null,
    seedUserConnections: createLocalLightUserSeed({ db: handle, now, onEmbedSpaceBound: (): void => undefined }),
  });
}

// The resolver reads rows only; it mints no session, so the service carries no session secret.
function rowPrincipalResolver(db: Db): ReturnType<typeof createHostPrincipalResolver> {
  return createHostPrincipalResolver(sessionsOver(db));
}
