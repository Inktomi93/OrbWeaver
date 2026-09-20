// The local-light CONVENIENCE SEED (inference program §7.2) in its TWO halves, homed together because they
// are one decision. The two in-process vector rows (`local-light · encoder`, `local-light · reranker`) and
// their `user` bindings are ORDINARY `user_connections` rows a user may delete; without them a user's
// `embed`/`rerank` resolve `no-connection` and search reads empty.
//
//   • {@link seedLocalLightOnBoot} — the BOOT SWEEP. It enumerates `users` and therefore covers exactly the
//     accounts that exist AT BOOT: a fresh install's seeded owner and every pre-existing account. It covers
//     NOTHING minted afterwards, and saying so is the point (#2481) — the sibling boot step
//     `local-light-prefetch.ts` declares its enumeration limit in its own header, this one used to claim the
//     per-user call existed when it did not, and the claim read as coverage for a year of accounts that got
//     none until the next restart.
//   • {@link createLocalLightUserSeed} — the PER-USER half (§5.3b). An injected op handed to every
//     user-minting verb (`sessions.ensureUser`, `sessions.provisionIdentity`, `admin.createUser`), called
//     AFTER the users row commits — never inside a mint's own batch, because a failed vector floor must not
//     un-create an account.
//
// Both halves run the SAME `domain/connection` verb and are idempotent by the `(owner_id, label)` unique, so
// they converge rather than compete: a boot after a mint re-seeds nothing, and a mint on a box that just
// booted re-seeds nothing. Neither half ever rethrows — a failed seed is a logged warning the connection pane
// repairs with "add local-light rows".

import type { Db } from "@orb/db";
import { users } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { seedLocalLightConnections } from "#domain/connection";
import { getLog } from "#foundation/observability";
import { minter } from "../compose/minter.ts";

export interface SeedLocalLightDeps {
  readonly db: Db;
  readonly now: () => number;
}

/** One user's seed with the shared never-rethrow posture. Returns the rows newly inserted (0 on failure). */
async function seedOneUser(seedDeps: Parameters<typeof seedLocalLightConnections>[0], userId: UserId): Promise<number> {
  try {
    return await seedLocalLightConnections(seedDeps, userId);
    // The DEGRADE, ruled by §7.2/§5.3b and pinned by the boot + mint tests: the owner of this failure is the
    // connection pane, which offers "add local-light rows". A rethrow would take the server down over a
    // convenience seed (boot) or un-create an account over it (a mint) — neither is a trade this seed gets
    // to make. The warning names the user so an operator can repair it.
  } catch (err) {
    getLog().warn({ err, userId }, "seed-local-light: the local-light seed failed for a user — the pane offers a repair");
    return 0;
  }
}

/** The minters + clock both halves hand the connection verb. */
function seedDepsFrom(deps: SeedLocalLightDeps): Parameters<typeof seedLocalLightConnections>[0] {
  return { db: deps.db, now: deps.now, newConnectionId: minter(ID_PREFIX.userConnection), newBindingId: minter(ID_PREFIX.connectionBinding) };
}

/** The PER-USER half (§5.3b): the injected op every user-minting verb calls once its `users` row has
 *  committed. TOTAL by construction — it resolves whatever happens, because its caller is a user-create verb
 *  whose account must survive a failed convenience seed. Returns nothing: a mint has no use for the row
 *  count, which is the boot sweep's report. The shape is spelled out rather than aliased — `entry/boot` is
 *  not a type home (`no-inline-types`), and each consumer declares it in its own `contract/`. */
export function createLocalLightUserSeed(deps: SeedLocalLightDeps): (userId: UserId) => Promise<void> {
  const seedDeps = seedDepsFrom(deps);
  return async (userId: UserId): Promise<void> => {
    await seedOneUser(seedDeps, userId);
  };
}

/** The BOOT SWEEP over the accounts that exist AT BOOT (header). Returns the number of connection rows newly
 *  inserted across them (0 on a settled db). */
export async function seedLocalLightOnBoot(deps: SeedLocalLightDeps): Promise<number> {
  const seedDeps = seedDepsFrom(deps);
  const owners = await deps.db.select({ id: users.id }).from(users);
  let inserted = 0;
  for (const owner of owners) {
    inserted += await seedOneUser(seedDeps, owner.id);
  }
  if (inserted > 0) {
    getLog().info({ inserted, owners: owners.length }, "boot/seed-local-light: seeded local-light connections");
  }
  return inserted;
}
