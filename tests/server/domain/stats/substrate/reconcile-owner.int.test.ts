// substrate/reconcile-owner — the caller-scoped seam onto the write/ rebuild subsystem. Pins the ONE scope
// decision this file exists to bind: it always rebuilds exactly the passed `ownerId`'s rollups — another
// owner's `owner_stats` row is untouched, unlike the workload's bulk (no-ownerId) arm.

import { ownerStats } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { reconcileOwnerStats } from "../../../../../packages/server/src/domain/stats/substrate/reconcile-owner.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { seedOwnerStats, seedUser, T0 } from "../_support.ts";

describe("reconcileOwnerStats", () => {
  test("rebuilds exactly the passed owner's rollup — a sibling owner's stale row is untouched", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other", "user");
    // Stale/bogus rows for both — reconcile must only rewrite the caller's.
    await seedOwnerStats(db, owner, { userTurns: 999 });
    await seedOwnerStats(db, other, { userTurns: 999 });

    const result = await reconcileOwnerStats(db, { ownerId: owner, now: () => T0 });

    expect(result.owners).toBe(1);
    const [ownerRow] = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, owner));
    const [otherRow] = await db.select().from(ownerStats).where(eq(ownerStats.ownerId, other));
    // Canon has no messages for this owner, so the rebuild zeroes it (never leaves the stale 999).
    expect(ownerRow?.userTurns).toBe(0);
    // The sibling's stale seed value survives untouched — proof the rebuild is owner-scoped, not global.
    expect(otherRow?.userTurns).toBe(999);
  });
});
