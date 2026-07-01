// verb: clearChat — wipe the caller's transcript; owner-scoped (another user's turns untouched).

import { createBuddyService } from "@orb/server/domain/buddy";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("clearChat", () => {
  test("wipes the caller's transcript and reports the count", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    await svc.ask({ principal: principal(owner), message: "hi" });

    const { cleared } = await svc.clearChat({ principal: principal(owner) });
    expect(cleared).toBe(2); // the user line + the assistant line
    expect(await svc.history({ principal: principal(owner) })).toHaveLength(0);
  });

  test("owner-scoped — clearing one user does not touch another's transcript", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const alice = await seedUser(db, { id: "user_a" });
    const bob = await seedUser(db, { id: "user_b" });
    await svc.hatch({ principal: principal(alice) });
    await svc.hatch({ principal: principal(bob) });
    await svc.ask({ principal: principal(alice), message: "a" });
    await svc.ask({ principal: principal(bob), message: "b" });

    await svc.clearChat({ principal: principal(alice) });
    expect(await svc.history({ principal: principal(bob) })).toHaveLength(2);
  });
});
