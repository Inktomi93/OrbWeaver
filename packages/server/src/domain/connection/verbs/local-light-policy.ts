// The same total per-account policy serves boot's finite account sweep and accounts minted afterwards.

import { taskDef } from "@orb/contracts/inference";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { LocalLightBootPolicyDeps, LocalLightSeedPolicyDeps } from "../contract/local-light-policy.ts";

async function seedOneUser(deps: LocalLightSeedPolicyDeps, userId: UserId): Promise<number> {
  try {
    const seeded = await deps.seedConnections(userId);
    if (seeded.boundTasks.some((task) => taskDef(task).kind === "embedding")) {
      deps.onEmbedSpaceBound(userId);
    }
    return seeded.inserted;
  } catch (err) {
    // The connection pane repairs a missing convenience floor; an account and the server must survive it.
    getLog(deps.logger).warn({ err, userId }, "seed-local-light: the local-light seed failed for a user — the pane offers a repair");
    return 0;
  }
}

export function createLocalLightUserSeed(deps: LocalLightSeedPolicyDeps): (userId: UserId) => Promise<void> {
  return async (userId): Promise<void> => {
    await seedOneUser(deps, userId);
  };
}

export async function seedLocalLightAccounts(deps: LocalLightBootPolicyDeps): Promise<number> {
  const owners = await deps.listAccounts();
  let inserted = 0;
  for (const owner of owners) {
    inserted += await seedOneUser(deps, owner);
  }
  if (inserted > 0) {
    getLog(deps.logger).info({ inserted, owners: owners.length }, "boot/seed-local-light: seeded local-light connections");
  }
  return inserted;
}
