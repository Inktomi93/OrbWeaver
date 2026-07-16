// db.batch atomicity — the "a libsql/drizzle upgrade silently degrades batch atomicity" regression class.
// A `db.batch([...])` is the ONE primitive the PD-24 canon-write co-statements ride (the emit-op hands the
// producer UNEXECUTED co-statements, then commits them as ONE batch — _support.ts's `emitNotification`
// default: `db.batch(batchMany(coStatements))`). The whole contract is ALL-OR-NOTHING: if a later statement
// violates a UNIQUE constraint, the earlier statements MUST roll back. Nothing else in the suite pins this —
// every other test drives batches that succeed, so a silent degrade to "partial commit" (a driver upgrade
// dropping the implicit transaction) would pass every existing test while corrupting canon on the first
// mid-turn failure. This forces a UNIQUE (primary-key) violation mid-batch and asserts ZERO partial rows.
//
// NON-VACUITY: the positive control proves the batch mechanism actually lands rows (so the atomicity assert
// isn't green just because `batch` is a no-op); and the atomicity assert would FAIL the instant `db.batch`
// were swapped for sequential `await db.insert(...)` calls (the first row would survive the second's throw).

import { users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

const AT = 1_700_000_000_000;

/** A minimal valid `users` row (the born-compliant shape) for the given id/handle. */
function userRow(id: string, handle: string): typeof users.$inferInsert {
  return {
    id: castId<UserId>(id),
    handle: castId<Handle>(handle),
    role: "user",
    enabled: true,
    createdAt: AT,
    updatedAt: AT,
  };
}

describe("db.batch atomicity — a UNIQUE violation mid-batch lands ZERO rows (PD-24 co-statement class)", () => {
  test("the positive control: a valid two-statement batch commits BOTH rows", async () => {
    const db = await freshDb();

    await db.batch([db.insert(users).values(userRow("user_ctl_a", "ctl-a")), db.insert(users).values(userRow("user_ctl_b", "ctl-b"))]);

    const rows = await db.select({ id: users.id }).from(users);
    expect(rows.map((r) => r.id).sort()).toEqual(["user_ctl_a", "user_ctl_b"]);
  });

  test("a batch whose SECOND statement duplicates an existing PK rejects AND rolls back the FIRST", async () => {
    const db = await freshDb();
    // Pre-seed the row the batch's second statement will collide with (a UNIQUE primary-key violation).
    await db.insert(users).values(userRow("user_existing", "existing"));

    // The batch: statement 1 is a brand-new valid row; statement 2 re-inserts the existing PK → UNIQUE
    // violation MID-BATCH. Atomicity demands statement 1 never lands.
    await expect(
      db.batch([db.insert(users).values(userRow("user_fresh", "fresh")), db.insert(users).values(userRow("user_existing", "existing-dup"))]),
    ).rejects.toThrow();

    // THE ATOMICITY ASSERT: the pre-batch row survived, but the batch's first (valid) row did NOT land —
    // a partial commit would leave `user_fresh` behind (exactly the regression this suite guards).
    const fresh = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, castId<UserId>("user_fresh")));
    expect(fresh).toHaveLength(0);
    const all = await db.select({ id: users.id }).from(users);
    expect(all.map((r) => r.id)).toEqual(["user_existing"]);
  });
});
