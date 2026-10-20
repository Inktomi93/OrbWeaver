// verb: countDistillCalls — the distill sweep's model-call estimate: one call per non-synthetic card with
// content, scoped to one owner or box-wide. The agreement with the real batch lives in distill.int.test.ts.
// @subject packages/server/src/domain/discovery/verbs/count-distill-calls.ts

import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createDiscoveryService } from "#server/domain/discovery/index.ts";
import { everyOwnerAuthority } from "../../workloads/_support.ts";
import { makeDiscoveryHarness, seedCharacter, seedUser } from "../_support.ts";

// Every-owner authority as the workload runner and the estimate door hand it out.
const EVERY_OWNER = await everyOwnerAuthority();

describe("countDistillCalls", () => {
  test("counts only content-bearing, non-synthetic cards: a name-only card and a group character cost no call", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    await seedCharacter(db, { id: "character_alpha", ownerId: owner, name: "Alpha", description: "Alpha the aeronaut." });
    await seedCharacter(db, { id: "character_gamma", ownerId: owner, name: "Gamma", description: "Gamma the glassblower." });
    await seedCharacter(db, { id: "character_bare", ownerId: owner, name: "Bare" });
    await seedCharacter(db, { id: "character_group", ownerId: owner, description: "A shared room.", synthetic: true });
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);

    expect(await svc.countDistillCalls(owner)).toBe(2);
  });

  test("an owner's estimate excludes every other owner's cards; null counts the whole box", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_a");
    const other = await seedUser(db, "user_b");
    const empty = await seedUser(db, "user_c");
    await seedCharacter(db, { id: "character_alpha", ownerId: owner, name: "Alpha", description: "Alpha the aeronaut." });
    await seedCharacter(db, { id: "character_beta", ownerId: other, name: "Beta", description: "Beta the botanist." });
    await seedCharacter(db, { id: "character_delta", ownerId: other, name: "Delta", description: "Delta the diver." });
    const svc = createDiscoveryService(makeDiscoveryHarness(db).ctx);

    expect(await svc.countDistillCalls(owner)).toBe(1);
    expect(await svc.countDistillCalls(other)).toBe(2);
    expect(await svc.countDistillCalls(empty)).toBe(0);
    expect(await svc.countDistillCalls(EVERY_OWNER.estimate)).toBe(3);
  });
});
