// verb: hatch — snapshot bones + a model-authored soul; idempotent; canned fallback when the soul engine
// is down. Owner-scoped.

import { createBuddyService } from "@orb/server/domain/buddy";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("hatch", () => {
  test("hatches with the model-authored soul + the rolled bones", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });

    const view = await svc.hatch({ principal: principal(owner) });
    expect(view.status).toBe("hatched");
    expect(view.name).toBe("Sparkle");
    expect(view.personality).toBeTruthy();
    expect(view.hatchedAt).not.toBeNull();
  });

  test("is idempotent — re-hatching returns the existing buddy unchanged", async () => {
    const db = await freshDb();
    const svc = createBuddyService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_o" });

    const first = await svc.hatch({ principal: principal(owner) });
    const second = await svc.hatch({ principal: principal(owner) });
    expect(second.name).toBe(first.name);
    expect(second.bones).toEqual(first.bones);
  });

  test("falls back to a canned soul when the soul engine is down", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const svc = createBuddyService(h.ctx);
    const owner = await seedUser(db, { id: "user_o" });
    h.setSummarizeThrows(true);

    const view = await svc.hatch({ principal: principal(owner) });
    expect(view.name).toBeTruthy();
    expect(view.name).not.toBe("Sparkle"); // not the model soul — the canned species name
    expect(view.personality).toBeTruthy();
  });
});
