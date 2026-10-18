// The local-light CONVENIENCE SEED (inference program §7.2) in its TWO halves, homed together because they
// are one decision. The two in-process vector rows (`LOCAL_LIGHT_SEED_ROWS`: the built-in encoder and reranker) and
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
//
// A seed that newly binds a vector task changes that owner's embed space exactly as a pane binding write does,
// but it bypasses the verb that raises the reindex. So both halves hand the owner to `onEmbedSpaceBound`, the
// per-owner sweep enqueue; without it a fresh install's search waits forever on sweeps nothing scheduled.

// Entry binds the writer/read capabilities; connection owns refusal, notification and sweep settlement.

import type { DatabaseHandle } from "@orb/db/wiring";
import type { IdSource, UserId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { createLocalLightUserSeed as createUserSeedPolicy, seedLocalLightAccounts, seedLocalLightConnections } from "#domain/connection";
import { createListSeedAccountIds } from "#domain/sessions";
import { minter } from "../compose/minter.ts";

export interface SeedLocalLightDeps {
  readonly idSource?: IdSource;
  readonly db: DatabaseHandle;
  readonly now: () => number;
  /** Called with an owner whose seed newly bound a vector task (their embed space changed). */
  readonly onEmbedSpaceBound: (userId: UserId) => void;
}

/** Preserve the per-call provider lookup and determinism seams while binding only graph capabilities. */
function seedDepsFrom(deps: SeedLocalLightDeps): Parameters<typeof seedLocalLightConnections>[0] {
  return {
    db: deps.db,
    now: deps.now,
    newConnectionId: minter(ID_PREFIX.userConnection, deps.idSource),
    newBindingId: minter(ID_PREFIX.connectionBinding, deps.idSource),
  };
}

export function createLocalLightUserSeed(deps: SeedLocalLightDeps): (userId: UserId) => Promise<void> {
  return createUserSeedPolicy({
    seedConnections: (userId) => seedLocalLightConnections(seedDepsFrom(deps), userId),
    onEmbedSpaceBound: (userId) => deps.onEmbedSpaceBound(userId),
  });
}

export async function seedLocalLightOnBoot(deps: SeedLocalLightDeps): Promise<number> {
  return await seedLocalLightAccounts({
    seedConnections: (userId) => seedLocalLightConnections(seedDepsFrom(deps), userId),
    onEmbedSpaceBound: (userId) => deps.onEmbedSpaceBound(userId),
    listAccounts: createListSeedAccountIds(deps.db),
  });
}
