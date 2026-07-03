// verb: getUserSettings — a never-touched account reads the parsed defaults with `updatedAt: 0` and NO
// row written (the read/write asymmetry); a written account reads back its stored config.

import { userSettings } from "@orb/db";
import { eq } from "drizzle-orm";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

describe("getUserSettings", () => {
  test("a never-touched account reads defaults, updatedAt 0, and writes NO row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    const view = await h.svc.getUserSettings({ principal: principal(u, "user") });
    expect(view.userId).toBe(u);
    expect(view.updatedAt).toBe(0);
    expect(view.config.memory.enabled).toBe(false);
    // A pure read must NOT materialize the row.
    const rows = await db.select().from(userSettings).where(eq(userSettings.userId, u));
    expect(rows).toHaveLength(0);
  });

  test("reads back a written config (scoped to the principal's userId)", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const u = await seedUser(db, { id: "user_u" });
    await h.svc.updateUserSettingsSection({
      principal: principal(u, "user"),
      input: { section: "memory", patch: { enabled: true } },
    });
    const view = await h.svc.getUserSettings({ principal: principal(u, "user") });
    expect(view.config.memory.enabled).toBe(true);
    expect(view.updatedAt).toBeGreaterThan(0);
  });
});
