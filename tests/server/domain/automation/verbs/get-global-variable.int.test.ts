// verb: getGlobalVariable — owner-scoped read; a foreign owner's key reads as null (no cross-user reads).

import { createAutomationService } from "@orb/server/domain/automation";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeAutomationHarness, principal, seedUser } from "../_support.ts";

describe("getGlobalVariable", () => {
  test("reads back the owner's own value", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "streak", value: "7" });

    await expect(svc.getGlobalVariable({ principal: principal(owner), key: "streak" })).resolves.toBe("7");
  });

  test("an unset key reads as null", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await expect(svc.getGlobalVariable({ principal: principal(owner), key: "nope" })).resolves.toBeNull();
  });

  test("user B cannot read user A's global (fetchOwned isolation)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "secret", value: "42" });

    await expect(svc.getGlobalVariable({ principal: principal(other), key: "secret" })).resolves.toBeNull();
  });
});
