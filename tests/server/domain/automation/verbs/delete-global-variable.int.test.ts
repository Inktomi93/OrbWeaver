// verb: deleteGlobalVariable — owner-scoped removal; idempotent on absent; a foreign owner can't delete.

import { createAutomationService } from "@orb/server/domain/automation";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeAutomationHarness, principal, seedUser } from "../_support.ts";

describe("deleteGlobalVariable", () => {
  test("removes the owner's key", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "k", value: "v" });
    await svc.deleteGlobalVariable({ principal: principal(owner), key: "k" });

    await expect(svc.getGlobalVariable({ principal: principal(owner), key: "k" })).resolves.toBeNull();
  });

  test("is idempotent on an absent key", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await expect(svc.deleteGlobalVariable({ principal: principal(owner), key: "ghost" })).resolves.toBeUndefined();
  });

  test("a foreign owner cannot delete another user's key", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "k", value: "v" });
    await svc.deleteGlobalVariable({ principal: principal(other), key: "k" });

    // owner's key survives — the delete was owner-scoped
    await expect(svc.getGlobalVariable({ principal: principal(owner), key: "k" })).resolves.toBe("v");
  });
});
