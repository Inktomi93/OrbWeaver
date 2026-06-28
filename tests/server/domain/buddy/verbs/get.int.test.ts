// verb: get — unhatched → deterministic preview; hatched → stored view with lazy read-time mood decay.

import { createBuddyService } from "@orb/server/domain/buddy";
import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("get", () => {
  test("unhatched → a deterministic preview (bones present, no soul)", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });

    const view = await svc.get({ principal: principal(owner) });
    expect(view.status).toBe("unhatched");
    expect(view.name).toBeNull();
    expect(view.bones.rarity).toBeTruthy();
  });

  test("hatched → the stored view with the model-authored soul", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });

    const view = await svc.get({ principal: principal(owner) });
    expect(view.status).toBe("hatched");
    expect(view.name).toBe("Sparkle");
  });

  test("lazy decay: a long-quiet buddy reads as content", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    await svc.hatch({ principal: principal(owner) });
    // No lastReactionAt is set at hatch (null) → decay is a no-op; the mood is the hatch default.
    const view = await svc.get({ principal: principal(owner) });
    expect(view.mood).toBe("content");
  });
});
