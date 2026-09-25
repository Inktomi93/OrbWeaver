// entry/boot/seed-local-light — the boot step over EVERY existing user. The tier rule is what is pinned:
// boot wiring may not abort the process, so one user's failed seed is a logged warning and the REMAINING
// users are still seeded (a loop that let the rejection escape would leave an install half-seeded and the
// server down). Idempotency on a settled db (0 inserted) is the second half — this runs on every boot.

import type { Db } from "@orb/db";
import { userConnections, users } from "@orb/db";
import { handleKey } from "@orb/kit/handle-key";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createSessionsService } from "@orb/server/domain/sessions";
import { eq, sql } from "drizzle-orm";
import { createLocalLightUserSeed, seedLocalLightOnBoot } from "../../../../packages/server/src/entry/boot/seed-local-light.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

const IGNORE_BOUND = (): void => undefined;

async function seedUser(db: Db, id: string): Promise<UserId> {
  const userId = castId<UserId>(id);
  await db.insert(users).values({
    id: userId,
    handle: castId<Handle>(id),
    handleKey: handleKey(castId<Handle>(id)),
    role: "user",
    enabled: true,
    passwordHash: null,
    createdAt: FROZEN_AT_MS,
    updatedAt: FROZEN_AT_MS,
  });
  return userId;
}

test("seeds every existing user, then reports 0 on the next boot", async () => {
  const db = await freshDb();
  const userA = await seedUser(db, "user_a");
  const userB = await seedUser(db, "user_b");
  const bound: UserId[] = [];
  const deps = { db, now: (): number => FROZEN_AT_MS, onEmbedSpaceBound: (userId: UserId): void => void bound.push(userId) };
  expect(await seedLocalLightOnBoot(deps), "two users × two rows").toBe(4);
  expect(await seedLocalLightOnBoot(deps), "a settled db seeds nothing on the next boot").toBe(0);
  expect(await db.select().from(userConnections)).toHaveLength(4);
  // The seed bound each owner's encoder once, which changed their embed space: the sweeps must be scheduled once.
  expect(new Set(bound)).toEqual(new Set([userA, userB]));
  expect(bound).toHaveLength(2);
});

test("an install with no users is a clean zero", async () => {
  const db = await freshDb();
  expect(await seedLocalLightOnBoot({ db, now: (): number => FROZEN_AT_MS, onEmbedSpaceBound: IGNORE_BOUND })).toBe(0);
});

test("one user's failure does NOT abort boot — every remaining user is still attempted", async () => {
  const db = await freshDb();
  await seedUser(db, "user_a");
  await seedUser(db, "user_b");
  // Force the seed's LAST statement (the binding insert) to fail for every user, with the rows already written:
  // the boot step must swallow it per user and keep going, because a boot that throws here takes the server down
  // over a convenience seed the pane can repair.
  await db.run(sql`create trigger refuse_bindings before insert on connection_bindings begin select raise(abort, 'refused'); end`);
  await expect(seedLocalLightOnBoot({ db, now: (): number => FROZEN_AT_MS, onEmbedSpaceBound: IGNORE_BOUND })).resolves.toBe(0);
  expect(await db.select().from(userConnections), "both users were attempted, not just the first").toHaveLength(4);
});

// ── THE POST-BOOT MINT (#2481) ──────────────────────────────────────────────────────────────────────
// The sweep above covers the users that exist AT BOOT. Every account minted after it — every SSO/JIT login
// and every admin mint — waited for the next restart, so its `embed`/`rerank` resolved `no-connection` and
// search read empty for the whole life of the process. These pin the OTHER half: the per-user seed the mint
// sites call through an injected op.
const POST_BOOT_PEPPER = "test-session-secret-at-least-32-chars-long";

test("a user minted AFTER the boot sweep still carries the vector floor", async () => {
  const db = await freshDb();
  const now = (): number => FROZEN_AT_MS;
  // The boot the account misses: the sweep enumerates the users that exist right now, and there are none.
  expect(await seedLocalLightOnBoot({ db, now, onEmbedSpaceBound: IGNORE_BOUND }), "the sweep runs with no users on the box").toBe(0);

  const bound: UserId[] = [];
  const onEmbedSpaceBound = (boundUser: UserId): void => void bound.push(boundUser);
  const sessions = createSessionsService({
    db,
    now,
    sessionSecret: POST_BOOT_PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now, onEmbedSpaceBound }),
  });
  const userId = await sessions.ensureUser(castId<Handle>("post_boot"));
  expect(bound, "the mint's seed schedules the new owner's sweeps").toEqual([userId]);

  expect(await db.select().from(userConnections).where(eq(userConnections.ownerId, userId)), "seeded at the mint, not at the next restart").toHaveLength(2);
  // And the NEXT boot converges rather than duplicating — both halves key on the same `(owner_id, label)`.
  expect(await seedLocalLightOnBoot({ db, now, onEmbedSpaceBound: IGNORE_BOUND }), "the sweep after a mint re-seeds nothing").toBe(0);
});

test("a FAILING per-user seed is a warning, never a failed mint (\u00a75.3b)", async () => {
  const db = await freshDb();
  const now = (): number => FROZEN_AT_MS;
  // The seed's SECOND statement dies for every user, with the first already applied — the mint must still
  // return the account. An un-seedable vector floor is repairable; an un-created account is not.
  await db.run(sql`drop table connection_bindings`);
  const sessions = createSessionsService({
    db,
    now,
    sessionSecret: POST_BOOT_PEPPER,
    seedUserConnections: createLocalLightUserSeed({ db, now, onEmbedSpaceBound: IGNORE_BOUND }),
  });

  const userId = await sessions.ensureUser(castId<Handle>("survivor"));
  expect(await db.select().from(users).where(eq(users.id, userId)), "the account exists despite the failed seed").toHaveLength(1);
});
