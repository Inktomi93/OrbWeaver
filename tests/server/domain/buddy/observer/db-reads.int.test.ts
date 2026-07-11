// observer/db-reads — the owner/host reads against a real db. Pins resolveWorkloadOwner (`workloads.ownerId`
// by id; a NULL-owner system row → null) — the "whose buddy reacts" hop for a workload beat. (The belt's
// agent-owner hop moved to the entry root — the no-direct-users-read chokepoint — and is behaviorally pinned
// by the signal-router belt test.)

import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { createBuddyObserverReads } from "../../../../../packages/server/src/domain/buddy/observer/db-reads.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { seedWorkloadRow } from "../../workloads/_support.ts";
import { seedUser } from "../_support.ts";

describe("buddy observer db-reads", () => {
  test("resolveWorkloadOwner returns the row's owner; null for a system row / unknown id", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, { id: "user_owner" });
    const owned = await seedWorkloadRow(db, { id: "workload_owned", ownerId: owner });
    const system = await seedWorkloadRow(db, { id: "workload_system", ownerId: null });
    const reads = createBuddyObserverReads(db);

    expect(await reads.resolveWorkloadOwner(owned)).toBe(owner);
    expect(await reads.resolveWorkloadOwner(system)).toBeNull();
    expect(await reads.resolveWorkloadOwner(castId<UserId>("workload_ghost"))).toBeNull();
  });
});
