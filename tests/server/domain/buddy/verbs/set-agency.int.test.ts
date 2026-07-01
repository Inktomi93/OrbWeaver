// verb: setAgency — toggle the capability-ceiling kill switch; unhatched is a no-op preview with the flag.

import { createBuddyService } from "@orb/server/domain/buddy";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("setAgency", () => {
  test("toggles agencyEnabled on a hatched buddy", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });

    const view = await svc.setAgency({ principal: principal(owner), enabled: false });
    expect(view.agencyEnabled).toBe(false);
    expect((await svc.get({ principal: principal(owner) })).agencyEnabled).toBe(false);
  });

  test("unhatched → a no-op preview carrying the requested flag", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });

    const view = await svc.setAgency({ principal: principal(owner), enabled: false });
    expect(view.status).toBe("unhatched");
    expect(view.agencyEnabled).toBe(false);
  });
});
