// verb: updateUserSettingsSection — deep-merge ONE namespace + re-validate. The load-bearing invariant
// (esoteric #5): two concurrent patches on SIBLING sections of the SAME user both land (the per-user
// serializer makes the read-merge-write atomic w.r.t. other same-user writes — without it last-write-wins
// would silently drop one). Plus: a section patch deep-merges (doesn't clobber sibling sections/keys).

import { describe, expect, test } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("updateUserSettingsSection", () => {
  test("two concurrent patches on sibling sections BOTH land (serialized per user)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const p = principal(u, "user");
    await Promise.all([
      h.svc.updateUserSettingsSection({
        principal: p,
        input: { section: "memory", patch: { enabled: true } },
      }),
      h.svc.updateUserSettingsSection({
        principal: p,
        input: { section: "worldInfo", patch: { scanDepth: 42 } },
      }),
    ]);
    const view = await h.svc.getUserSettings({ principal: p });
    // Neither write clobbered the other.
    expect(view.config.memory.enabled).toBe(true);
    expect(view.config.worldInfo.scanDepth).toBe(42);
  });

  test("a patch deep-merges into the section (siblings survive)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const p = principal(u, "user");
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "worldInfo", patch: { scanDepth: 10 } },
    });
    await h.svc.updateUserSettingsSection({
      principal: p,
      input: { section: "worldInfo", patch: { tokenBudget: 2048 } },
    });
    const view = await h.svc.getUserSettings({ principal: p });
    expect(view.config.worldInfo.scanDepth).toBe(10);
    expect(view.config.worldInfo.tokenBudget).toBe(2048);
  });

  test("different users run concurrently (each lands its own row)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const a = await seedUser(db, { id: "user_a" });
    const b = await seedUser(db, { id: "user_b" });
    await Promise.all([
      h.svc.updateUserSettingsSection({
        principal: principal(a, "user"),
        input: { section: "memory", patch: { enabled: true } },
      }),
      h.svc.updateUserSettingsSection({
        principal: principal(b, "user"),
        input: { section: "memory", patch: { enabled: false } },
      }),
    ]);
    expect(
      (await h.svc.getUserSettings({ principal: principal(a, "user") })).config.memory.enabled,
    ).toBe(true);
    expect(
      (await h.svc.getUserSettings({ principal: principal(b, "user") })).config.memory.enabled,
    ).toBe(false);
  });
});
