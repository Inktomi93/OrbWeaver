// verb: history — the persisted transcript, oldest-first, owner-scoped.

import { createBuddyService } from "@orb/server/domain/buddy";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("history", () => {
  test("returns the transcript oldest-first", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    h.setTurnText("reply one");
    await svc.ask({ principal: principal(owner), message: "msg one" });

    const turns = await svc.history({ principal: principal(owner) });
    expect(turns.map((t) => t.role)).toEqual(["you", "buddy"]);
    expect(turns[0]?.text).toBe("msg one");
  });

  test("is empty for a user who never talked", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });
    expect(await svc.history({ principal: principal(owner) })).toHaveLength(0);
  });
});
