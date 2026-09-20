// Boot step: the local-light CONVENIENCE SEED for every existing user (inference program §7.2). The two
// in-process vector rows (`local-light · encoder`, `local-light · reranker`) and their `user` bindings are
// ORDINARY `user_connections` rows a user may delete; this step only guarantees a fresh install and every
// pre-existing account start with a working vector floor. Idempotent by the `(owner_id, label)` unique — a
// no-op on every boot after the first — and never a boot abort: a failed seed is a logged warning the pane
// repairs with "add local-light rows". The user-create sites call the same verb for a NEW account.

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import { ID_PREFIX } from "@orb/kit/ids";
import { seedLocalLightConnections } from "#domain/connection";
import { getLog } from "#foundation/observability";
import { minter } from "../compose/minter.ts";

export interface SeedLocalLightDeps {
  readonly db: Db;
  readonly now: () => number;
}

/** Returns the number of connection rows newly inserted across every user (0 on a settled db). */
export async function seedLocalLightOnBoot(deps: SeedLocalLightDeps): Promise<number> {
  const seedDeps = { db: deps.db, now: deps.now, newConnectionId: minter(ID_PREFIX.userConnection), newBindingId: minter(ID_PREFIX.connectionBinding) };
  const owners = await deps.db.select({ id: users.id }).from(users);
  let inserted = 0;
  for (const owner of owners) {
    try {
      inserted += await seedLocalLightConnections(seedDeps, owner.id);
    } catch (err) {
      getLog().warn({ err, userId: owner.id }, "boot/seed-local-light: the local-light seed failed for a user — the pane offers a repair");
    }
  }
  if (inserted > 0) {
    getLog().info({ inserted, owners: owners.length }, "boot/seed-local-light: seeded local-light connections");
  }
  return inserted;
}
