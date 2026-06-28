// entry/boot/seed-owner — the privileged boot owner backfill. Real libSQL :memory: (the .int lane). Covers:
// a non-owner row at an OWNER handle is flipped to role=owner; the returned ids match; idempotent (a second
// run keeps role=owner and does NOT re-stamp updated_at, proving the ne(role,'owner') guard changed 0 rows);
// a row whose handle is NOT in OWNER_HANDLES is left untouched. `ensureUser` is stubbed to the row the test
// seeded (its JIT-create mechanics are tested in domain/sessions — this isolates the backfill).

import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { seedOwner } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import { freshDb } from "../../../support/db";
import { expect, test } from "../../../support/fixtures";

const OWNER_ID = castId<UserId>("u_owner");
const OTHER_ID = castId<UserId>("u_other");

test("backfills a non-owner OWNER-handle row to role=owner + returns its id", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(users).values({ id: OWNER_ID, handle: castId<Handle>("owner"), role: "user" });

  const ids = await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
    ownerHandles: ["owner"],
    now: clock.now,
  });

  expect(ids).toEqual([OWNER_ID]);
  const [row] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  expect(row?.role).toBe("owner");
});

test("idempotent — a second run keeps role=owner and does not re-stamp updated_at", async ({
  clock,
}) => {
  const db = await freshDb();
  await db
    .insert(users)
    .values({ id: OWNER_ID, handle: castId<Handle>("owner"), role: "user", updatedAt: 1 });

  await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
    ownerHandles: ["owner"],
    now: clock.now,
  });
  const [afterFirst] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  const stampedAt = afterFirst?.updatedAt;
  expect(afterFirst?.role).toBe("owner");

  clock.advance(10_000);
  await seedOwner({
    db,
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
    ownerHandles: ["owner"],
    now: clock.now,
  });
  const [afterSecond] = await db.select().from(users).where(eq(users.id, OWNER_ID));
  expect(afterSecond?.role).toBe("owner");
  // The ne(role,'owner') guard matched 0 rows on the second run → updated_at is unchanged.
  expect(afterSecond?.updatedAt).toBe(stampedAt);
});

test("leaves a non-OWNER-handle row untouched (stays role=user)", async ({ clock }) => {
  const db = await freshDb();
  await db.insert(users).values({ id: OTHER_ID, handle: castId<Handle>("someone"), role: "user" });

  await seedOwner({
    db,
    // ensureUser would JIT-create the owner row in production; here the test only cares the OTHER row is left alone.
    sessions: { ensureUser: (): Promise<UserId> => Promise.resolve(OWNER_ID) },
    ownerHandles: ["owner"],
    now: clock.now,
  });

  const [row] = await db.select().from(users).where(eq(users.id, OTHER_ID));
  expect(row?.role).toBe("user");
});
