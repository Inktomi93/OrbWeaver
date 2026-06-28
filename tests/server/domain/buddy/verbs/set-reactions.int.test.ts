// verb: setReactions — toggle the observer flag; unhatched is a no-op returning the preview with the flag.

import { createBuddyService } from "@orb/server/domain/buddy";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("setReactions", () => {
  test("toggles reactionsEnabled on a hatched buddy", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });

    const view = await svc.setReactions({ principal: principal(owner), enabled: false });
    expect(view.reactionsEnabled).toBe(false);
    expect((await svc.get({ principal: principal(owner) })).reactionsEnabled).toBe(false);
  });

  test("unhatched → a no-op preview carrying the requested flag", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });

    const view = await svc.setReactions({ principal: principal(owner), enabled: false });
    expect(view.status).toBe("unhatched");
    expect(view.reactionsEnabled).toBe(false);
  });
});
