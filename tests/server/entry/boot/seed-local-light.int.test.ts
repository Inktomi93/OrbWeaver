// entry/boot/seed-local-light — the boot step over EVERY existing user. The tier rule is what is pinned:
// boot wiring may not abort the process, so one user's failed seed is a logged warning and the REMAINING
// users are still seeded (a loop that let the rejection escape would leave an install half-seeded and the
// server down). Idempotency on a settled db (0 inserted) is the second half — this runs on every boot.

import type { Db } from "@orb/db";
import { userConnections, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { seedLocalLightOnBoot } from "../../../../packages/server/src/entry/boot/seed-local-light.ts";
import { FROZEN_AT_MS } from "../../../support/clock.ts";
import { freshDb } from "../../../support/db.ts";
import { expect, test } from "../../../support/fixtures.ts";

async function seedUser(db: Db, id: string): Promise<UserId> {
  const userId = castId<UserId>(id);
  await db.insert(users).values({
    id: userId,
    handle: castId<Handle>(id),
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
  await seedUser(db, "user_a");
  await seedUser(db, "user_b");
  const deps = { db, now: (): number => FROZEN_AT_MS };
  expect(await seedLocalLightOnBoot(deps), "two users × two rows").toBe(4);
  expect(await seedLocalLightOnBoot(deps), "a settled db seeds nothing on the next boot").toBe(0);
  expect(await db.select().from(userConnections)).toHaveLength(4);
});

test("an install with no users is a clean zero", async () => {
  const db = await freshDb();
  expect(await seedLocalLightOnBoot({ db, now: (): number => FROZEN_AT_MS })).toBe(0);
});

test("one user's failure does NOT abort boot — every remaining user is still attempted", async () => {
  const db = await freshDb();
  await seedUser(db, "user_a");
  await seedUser(db, "user_b");
  // Force the seed's SECOND statement to fail for every user, with the first already applied: the boot step
  // must swallow it per user and keep going, because a boot that throws here takes the server down over a
  // convenience seed the pane can repair.
  await db.run(sql`drop table connection_bindings`);
  await expect(seedLocalLightOnBoot({ db, now: (): number => FROZEN_AT_MS })).resolves.toBe(0);
  expect(await db.select().from(userConnections), "both users were attempted, not just the first").toHaveLength(4);
});
