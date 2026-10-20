// verb: deleteGlobalVariable — owner-scoped removal; idempotent on absent; a foreign owner can't delete.
// @subject packages/server/src/domain/automation/verbs/delete-global-variable.ts

import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { createAutomationService } from "#server/domain/automation/index.ts";
import { makeAutomationHarness, principal, seedUser } from "../_support.ts";

describe("deleteGlobalVariable", () => {
  test("removes the owner's key", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: await principal(db, owner), key: "k", value: "v" });
    await svc.deleteGlobalVariable({ principal: await principal(db, owner), key: "k" });

    await expect(svc.getGlobalVariable({ principal: await principal(db, owner), key: "k" })).resolves.toBeNull();
  });

  test("is idempotent on an absent key", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await expect(svc.deleteGlobalVariable({ principal: await principal(db, owner), key: "ghost" })).resolves.toBeUndefined();
  });

  test("a foreign owner cannot delete another user's key", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: await principal(db, owner), key: "k", value: "v" });
    await svc.deleteGlobalVariable({ principal: await principal(db, other), key: "k" });

    // owner's key survives — the delete was owner-scoped
    await expect(svc.getGlobalVariable({ principal: await principal(db, owner), key: "k" })).resolves.toBe("v");
  });
});
