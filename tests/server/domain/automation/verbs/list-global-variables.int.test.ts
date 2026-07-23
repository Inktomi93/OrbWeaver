// verb: listGlobalVariables — owner-scoped, key-sorted enumeration + prefix filter; cross-user isolation.

import { createAutomationService } from "@orb/server/domain/automation";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeAutomationHarness, principal, seedUser } from "../_support.ts";

describe("listGlobalVariables", () => {
  test("lists the owner's globals key-sorted", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "beta", value: "2" });
    await svc.setGlobalVariable({ principal: principal(owner), key: "alpha", value: "1" });

    const keys = (await svc.listGlobalVariables({ principal: principal(owner) })).map((v) => v.key);
    expect(keys).toEqual(["alpha", "beta"]);
  });

  test("prefix narrows the read (literal, not wildcard)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "quest.hp", value: "10" });
    await svc.setGlobalVariable({ principal: principal(owner), key: "quest.mp", value: "5" });
    await svc.setGlobalVariable({ principal: principal(owner), key: "mood", value: "grim" });

    const keys = (await svc.listGlobalVariables({ principal: principal(owner), prefix: "quest." })).map((v) => v.key);
    expect(keys).toEqual(["quest.hp", "quest.mp"]);
  });

  test("a `%` in the prefix is matched literally, not as a wildcard (LIKE-escape)", async () => {
    const db = await freshDb();
    const owner = await seedUser(db);
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "50%off", value: "y" });
    await svc.setGlobalVariable({ principal: principal(owner), key: "50xoff", value: "n" });

    const keys = (await svc.listGlobalVariables({ principal: principal(owner), prefix: "50%" })).map((v) => v.key);
    expect(keys).toEqual(["50%off"]);
  });

  test("only the caller's own globals are returned", async () => {
    const db = await freshDb();
    const owner = await seedUser(db, "user_owner");
    const other = await seedUser(db, "user_other");
    const svc = createAutomationService(makeAutomationHarness(db));

    await svc.setGlobalVariable({ principal: principal(owner), key: "mine", value: "1" });
    await svc.setGlobalVariable({ principal: principal(other), key: "theirs", value: "2" });

    const keys = (await svc.listGlobalVariables({ principal: principal(owner) })).map((v) => v.key);
    expect(keys).toEqual(["mine"]);
  });
});
